import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import type {
  Conversation,
  Harness,
  SettledSubmissionRecord,
  SubmissionRecord,
} from "@earendil-works/pi-durable";
import { eq } from "drizzle-orm";
import { db } from "#server/db/index.ts";
import { conversations } from "#server/db/schema.ts";
import { discordReady, getDiscordClient } from "#server/discord/client.ts";
import { sendDiscordMessageToChannel } from "#server/discord/messages.ts";
import { errorFields } from "#server/errors.ts";
import { createLogger } from "#server/logger.ts";
import { replyText } from "./conversation.ts";
import { createProjection } from "./projection.ts";
import { EMPTY_REPLY, failureReply } from "./replies.ts";
import { readTurn, TurnDoc, type Turn } from "./turn-context.ts";

const log = createLogger("conversation:recovery");
const context = BACKGROUND_CONTEXT;

async function discordReply(
  durable: Conversation,
  settled: SettledSubmissionRecord,
): Promise<string> {
  try {
    return (await replyText(durable, settled)) || EMPTY_REPLY;
  } catch (error) {
    return failureReply(error);
  }
}

async function answerOnDiscord(channelId: string, text: string): Promise<void> {
  if (!getDiscordClient()) {
    log.warn("cannot answer an interrupted Discord turn without Discord", { channelId });
    return;
  }
  await discordReady();
  await sendDiscordMessageToChannel(channelId, text);
}

/**
 * Sees one interrupted turn through: waits for the run pi-durable resumed, copies
 * what it added to `messages`, and answers on Discord, which never redelivers the
 * message. Slack and webhook turns are answered by their own job queues, whose
 * retries find the same submission.
 */
async function finish(harness: Harness, submission: SubmissionRecord): Promise<void> {
  const [row] = await db
    .select({ id: conversations.id })
    .from(conversations)
    .where(eq(conversations.durableConversationId, submission.conversationId));
  const durable = await harness.conversation(submission.conversationId, context);
  if (!row || !durable) return;

  const turn: Turn = readTurn(await harness.snapshot(TurnDoc, durable.id, context));
  log.info("finishing an interrupted turn", {
    conversationId: row.id,
    submissionId: submission.id,
    answersOnDiscord: turn.discordChannelId !== undefined,
  });

  const settled = await (await harness.submission(submission.id, context))!.wait(context);

  const projection = createProjection({
    conversationId: row.id,
    durable,
    ...turn.author,
    isHidden: async (entry) => turn.hidePrompt && entry === settled.entry,
  });
  projection.sync();
  await projection.flush();

  if (turn.discordChannelId) {
    await answerOnDiscord(turn.discordChannelId, await discordReply(durable, settled));
  }
}

/** Finishes, in the background, every turn the last process left running. */
export async function finishInterruptedTurns(harness: Harness): Promise<void> {
  let submissions: readonly SubmissionRecord[];
  try {
    ({ submissions } = await harness.inspect(context));
  } catch (error) {
    log.error("could not look for interrupted turns", errorFields(error));
    return;
  }
  const inputs = submissions.filter((submission) => submission.type === "input");
  await Promise.all(
    inputs.map((submission) =>
      finish(harness, submission).catch((error) =>
        log.error("could not finish an interrupted turn", {
          submissionId: submission.id,
          ...errorFields(error),
        }),
      ),
    ),
  );
}
