import { createLogger } from "#server/logger.ts";
import { errorFields } from "#server/errors.ts";
import { downloadImages, MAX_IMAGE_SIZE, type RemoteImage } from "#server/images.ts";
import { toolPresentation, type AgentContext, type TurnEvent } from "#server/agent/index.ts";
import { EMPTY_REPLY, failureReply } from "#server/agent/replies.ts";
import {
  conversationExists,
  runConversationTurn,
  stopConversation,
} from "#server/agent/conversation.ts";
import { TurnStoppedError } from "#server/agent/errors.ts";
import { describeToolCall, isActionTool } from "#server/agent/tool-display.ts";
import { parseToolPayload } from "#server/agent/tool-result.ts";
import { extractTable, type ResultTable } from "#server/agent/result-tables.ts";
import { markUserSeen, resolveAppUserId } from "#server/db/users.ts";
import { getActiveUser } from "#server/auth/account.ts";
import {
  linkReply,
  parseLinkCommand,
  redeemLinkCode,
  unlinkedReply,
} from "#server/auth/link-codes.ts";
import { tableBlocks } from "./tables.ts";
import { getSlackClient, setSessionStatus } from "./client.ts";
import { describeAppContext } from "./context.ts";
import { SlackResponseStream } from "./stream.ts";
import {
  buildExternalId,
  cleanMessageText,
  getImageFiles,
  isThreadReply,
  mentionsKyle,
  threadExternalId,
  type SlackEvent,
} from "./events.ts";
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
 * Mirrors the agent's progress into the thread: a task card per action, and a
 * table for results that read poorly as prose.
 */
function createProgressReporter(stream: SlackResponseStream): {
  onEvent: (event: TurnEvent) => void;
  tables: () => ResultTable[];
} {
  const toolArgs = new Map<string, Record<string, unknown>>();
  // Keyed by tool so repeated calls in one turn render a single, latest table.
  const tables = new Map<string, ResultTable>();

  return {
    tables: () => [...tables.values()],
    onEvent(event) {
      if (event.type === "assistant_start") stream.newParagraph();

      if (event.type === "text_delta") stream.appendText(event.delta);

      if (event.type === "tool_start") {
        toolArgs.set(event.toolCallId, event.args);
        const label = toolPresentation(event.toolName)?.label;
        if (label && isActionTool(event.toolName, event.args)) {
          stream.updateTask({ id: event.toolCallId, title: label, status: "in_progress" });
        }
      }

      if (event.type === "tool_end") {
        const args = toolArgs.get(event.toolCallId) ?? {};
        toolArgs.delete(event.toolCallId);

        const label = toolPresentation(event.toolName)?.label;
        const isAction = !!label && isActionTool(event.toolName, args);

        if (event.isError) {
          // A failed action keeps the present tense: it was attempted, not done.
          if (isAction) {
            stream.updateTask({
              id: event.toolCallId,
              title: label!,
              status: "error",
              output: event.content.find((block) => block.type === "text")?.text,
            });
          }
          return;
        }

        const payload = parseToolPayload(event);

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

/**
 * Whether a message is meant for Kyle: anything in a DM, an @mention, or any
 * reply in a thread Kyle is already part of.
 */
export async function isAddressedToKyle(event: SlackEvent): Promise<boolean> {
  if (event.channel_type === "im" || mentionsKyle(event)) return true;
  if (!isThreadReply(event)) return false;
  return conversationExists("slack", buildExternalId(event));
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

  const remoteImages = toRemoteImages(slackEvent);
  if (!messageText && remoteImages.length === 0) return "";

  const code = parseLinkCommand(messageText);
  if (code && userId) {
    const username = (usernameMap ?? (await resolveUsernames([userId]))).get(userId);
    const text = linkReply(await redeemLinkCode(code, "slack", userId, username), "slack");
    await saveReply?.(text);
    await postSlackReply(slackEvent, text);
    return text;
  }

  const appUserId = userId ? await resolveAppUserId("slack", userId) : null;
  if (!appUserId || !(await getActiveUser(appUserId))) {
    const text = unlinkedReply("slack");
    await saveReply?.(text);
    await postSlackReply(slackEvent, text);
    return text;
  }
  await markUserSeen(appUserId);

  const images = await downloadImages("slack", remoteImages);
  if (!messageText && images.length === 0) return "";

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

  await setSessionStatus(channel, replyThreadTs, "processing");

  const stream = new SlackResponseStream(getSlackClient(), {
    channel,
    threadTs: replyThreadTs,
    userId,
    teamId,
  });
  const progress = createProgressReporter(stream);

  let replyText: string;
  let tables: ResultTable[] = [];
  let stopped = false;
  try {
    const { conversationId, responseText } = await runConversationTurn({
      interfaceType: "slack",
      externalId: buildExternalId(slackEvent),
      metadata: { channel, threadTs: replyThreadTs },
      platformUserId: userId,
      appUserId,
      text: messageText,
      images,
      requestId: `slack:${slackEvent.ts}`,
      context: agentContext,
      onEvent: progress.onEvent,
    });

    tables = progress.tables();
    replyText = responseText || EMPTY_REPLY;
    log.info("slack reply prepared", { channel, threadTs: replyThreadTs, conversationId });
  } catch (error) {
    replyText = failureReply(error);
    stopped = error instanceof TurnStoppedError;
    if (stopped) {
      log.info("slack turn stopped", { channel, threadTs: replyThreadTs });
    } else {
      log.error("slack message processing failed", {
        channel,
        threadTs: replyThreadTs,
        ...errorFields(error),
      });
      stream.newParagraph();
      stream.appendText(replyText);
    }
  }

  try {
    await saveReply?.(replyText);
    if (stopped) await stream.stop(replyText);
    else await stream.finish(replyText, tables.length ? tableBlocks(tables) : undefined);
    return replyText;
  } finally {
    await setSessionStatus(channel, replyThreadTs, "active");
  }
}

/** Answers Slack's stop button by ending the turn running in that thread. */
export async function stopSlackThread(channel: string, threadTs: string): Promise<void> {
  await stopConversation("slack", threadExternalId(channel, threadTs));
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
