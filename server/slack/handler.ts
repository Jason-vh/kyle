import type { AgentEvent } from "@mariozechner/pi-agent-core";
import { createLogger } from "#server/logger.ts";
import { errorFields } from "#server/errors.ts";
import { downloadImages, MAX_IMAGE_SIZE, type RemoteImage } from "#server/images.ts";
import { toolPresentation, type AgentContext } from "#server/agent/index.ts";
import { EMPTY_REPLY, failureReply } from "#server/agent/replies.ts";
import { runConversationTurn } from "#server/agent/conversation.ts";
import { describeToolCall, isActionTool } from "#server/agent/tool-display.ts";
import { parseToolPayload } from "#server/agent/tool-result.ts";
import { extractTable, type ResultTable } from "#server/agent/result-tables.ts";
import { resolveAppUserId } from "#server/db/users.ts";
import { getActiveUser } from "#server/auth/account.ts";
import { tableBlocks } from "./tables.ts";
import { getSlackClient, setThreadStatus } from "./client.ts";
import { describeAppContext } from "./context.ts";
import { SlackResponseStream } from "./stream.ts";
import { buildExternalId, cleanMessageText, getImageFiles, type SlackEvent } from "./events.ts";
import { extractUserIds, resolveUsernames } from "./users.ts";

const log = createLogger("slack");

/** Slack keeps uploads behind the bot token, so every download needs it. */
function toRemoteImages(event: SlackEvent): RemoteImage[] {
  const token = process.env.SLACK_BOT_TOKEN;
  if (!token) return [];
  return getImageFiles(event.files)
    .filter((file) => !file.size || file.size <= MAX_IMAGE_SIZE)
    .map((file) => ({
      name: file.name ?? file.id,
      url: file.url_private,
      headers: { Authorization: `Bearer ${token}` },
    }));
}

/**
 * Mirrors the agent's progress into the thread: an ephemeral status line, a task
 * card per action, and a table for results that read poorly as prose.
 */
function createProgressReporter(
  stream: SlackResponseStream,
  channel: string,
  threadTs: string,
): { onEvent: (event: AgentEvent) => void; tables: () => ResultTable[] } {
  const toolArgs = new Map<string, Record<string, unknown>>();
  // Keyed by tool so repeated calls in one turn render a single, latest table.
  const tables = new Map<string, ResultTable>();

  return {
    tables: () => [...tables.values()],
    onEvent(event) {
      if (event.type === "message_start" && event.message.role === "assistant") {
        stream.newParagraph();
      }

      if (event.type === "message_update" && event.assistantMessageEvent.type === "text_delta") {
        stream.appendText(event.assistantMessageEvent.delta);
      }

      if (event.type === "tool_execution_start") {
        if (event.args) toolArgs.set(event.toolCallId, event.args);
        const label = toolPresentation(event.toolName)?.label;
        if (!label) return;

        setThreadStatus(channel, threadTs, label);
        if (isActionTool(event.toolName, event.args)) {
          stream.updateTask({ id: event.toolCallId, title: label, status: "in_progress" });
        }
      }

      if (event.type === "tool_execution_end") {
        const args = toolArgs.get(event.toolCallId) ?? {};
        toolArgs.delete(event.toolCallId);

        const label = toolPresentation(event.toolName)?.label;
        const isAction = !!label && isActionTool(event.toolName, args);

        if (event.isError) {
          // A failed action keeps the present tense: it was attempted, not done.
          if (isAction) {
            stream.updateTask({ id: event.toolCallId, title: label!, status: "error" });
          }
          return;
        }

        const payload = parseToolPayload(event.result);

        const table = extractTable(event.toolName, payload);
        if (table) tables.set(event.toolName, table);

        if (isAction) {
          // The result names what was acted on; the label only knows the verb.
          stream.updateTask({
            id: event.toolCallId,
            title: describeToolCall(event.toolName, args, payload),
            status: "complete",
          });
        }
      }
    },
  };
}

/** Runs one Slack message through the agent and streams the reply back into the thread. */
export async function processSlackMessage(
  slackEvent: SlackEvent,
  teamId?: string,
  saveReply?: (text: string) => Promise<void>,
): Promise<string> {
  const { channel, user: userId } = slackEvent;
  const replyThreadTs = slackEvent.thread_ts ?? slackEvent.ts;

  // Resolve @mentions to display names before the model ever sees the text.
  const rawText = slackEvent.text ?? "";
  const mentionedIds = extractUserIds(rawText);
  const usernameMap = mentionedIds.length > 0 ? await resolveUsernames(mentionedIds) : undefined;
  const messageText = cleanMessageText(rawText, usernameMap);

  const images = await downloadImages("slack", toRemoteImages(slackEvent));
  if (!messageText && images.length === 0) return "";

  const appUserId = userId ? await resolveAppUserId("slack", userId) : null;
  if (!appUserId || !(await getActiveUser(appUserId))) {
    const text = "Ask an admin to link your Slack account before using Kyle.";
    await saveReply?.(text);
    await postSlackReply(slackEvent, text);
    return text;
  }

  let agentContext: AgentContext | undefined;
  if (userId) {
    const senderMap = usernameMap?.has(userId) ? usernameMap : await resolveUsernames([userId]);
    agentContext = {
      username: senderMap.get(userId),
      userId: appUserId ?? undefined,
      interfaceType: "slack",
      viewing: await describeAppContext(slackEvent.app_context),
    };
  }

  setThreadStatus(channel, replyThreadTs, "is thinking...");

  const stream = new SlackResponseStream(getSlackClient(), {
    channel,
    threadTs: replyThreadTs,
    userId,
    teamId,
  });
  const progress = createProgressReporter(stream, channel, replyThreadTs);

  let replyText: string;
  let tables: ResultTable[] = [];
  try {
    const { conversationId, responseText } = await runConversationTurn({
      interfaceType: "slack",
      externalId: buildExternalId(slackEvent),
      metadata: { channel, threadTs: replyThreadTs },
      platformUserId: userId,
      appUserId,
      text: messageText,
      images,
      context: agentContext,
      onEvent: progress.onEvent,
      onRetry: (attempt, maxAttempts) => {
        setThreadStatus(channel, replyThreadTs, `is retrying... (${attempt}/${maxAttempts})`);
      },
    });

    tables = progress.tables();
    replyText = responseText || EMPTY_REPLY;
    log.info("slack reply prepared", { channel, threadTs: replyThreadTs, conversationId });
  } catch (error) {
    log.error("slack message processing failed", {
      channel,
      threadTs: replyThreadTs,
      ...errorFields(error),
    });

    replyText = failureReply(error);
    stream.newParagraph();
    stream.appendText(replyText);
  }

  try {
    await saveReply?.(replyText);
    await stream.finish(replyText, tables.length ? tableBlocks(tables) : undefined);
    return replyText;
  } finally {
    setThreadStatus(channel, replyThreadTs, "");
  }
}

export async function postSlackReply(event: SlackEvent, text: string): Promise<void> {
  if (!text) return;
  await getSlackClient().chat.postMessage({
    channel: event.channel,
    thread_ts: event.thread_ts ?? event.ts,
    markdown_text: text,
    unfurl_links: false,
    unfurl_media: false,
  });
}
