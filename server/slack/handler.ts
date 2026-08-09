import type { AgentEvent } from "@mariozechner/pi-agent-core";
import { createLogger } from "../logger.ts";
import { errorFields } from "../errors.ts";
import { downloadImages, MAX_IMAGE_SIZE, type RemoteImage } from "../images.ts";
import { toolPresentation, type AgentContext } from "../agent/index.ts";
import { EMPTY_REPLY, failureReply } from "../agent/replies.ts";
import { runConversationTurn } from "../agent/conversation.ts";
import { describeToolCall, isActionTool } from "../agent/tool-display.ts";
import { parseToolPayload } from "../agent/tool-result.ts";
import { extractTable, type ResultTable } from "../agent/result-tables.ts";
import { resolveAppUserId } from "../db/users.ts";
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

    const tables = progress.tables();
    await stream.finish(
      responseText || EMPTY_REPLY,
      tables.length ? tableBlocks(tables) : undefined,
    );
    log.info("slack reply sent", { channel, threadTs: replyThreadTs, conversationId });
    return responseText;
  } catch (error) {
    log.error("slack message processing failed", {
      channel,
      threadTs: replyThreadTs,
      ...errorFields(error),
    });

    const errorText = failureReply(error);
    try {
      stream.newParagraph();
      stream.appendText(errorText);
      await stream.finish(errorText);
    } catch (postError) {
      log.error("failed to post error message to slack", errorFields(postError));
    }
    return "";
  } finally {
    setThreadStatus(channel, replyThreadTs, "");
  }
}
