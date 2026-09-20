import { getSlackClient } from "./client.ts";
import { getAdminUserIds, getPlatformIdentity } from "#server/db/users.ts";
import { createLogger } from "#server/logger.ts";
import { errorMessage } from "#server/errors.ts";

const log = createLogger("slack:alerts");

const SLACK_PLATFORM = "slack";

/** The Slack ids of admins who have linked their account; the rest cannot be reached. */
async function adminSlackIds(): Promise<string[]> {
  const admins = await getAdminUserIds();
  const identities = await Promise.all(
    admins.map((userId) => getPlatformIdentity(userId, SLACK_PLATFORM)),
  );

  return identities.map((identity) => identity?.platformUserId).filter((id) => id !== undefined);
}

/**
 * The DM Slack already holds with this person.
 *
 * Opening one needs `im:write`, which the app does not have; listing them needs
 * `im:read`, which it does. Anyone who has ever spoken to Kyle has a DM
 * already, so the listing answers for everybody in practice.
 */
async function existingDirectMessage(slackUserId: string): Promise<string | undefined> {
  const slack = getSlackClient();
  const conversations = await slack.conversations.list({ types: "im", limit: 200 });
  return conversations.channels?.find((channel) => channel.user === slackUserId)?.id;
}

/**
 * Tells every admin something that has nothing to do with a conversation, in a
 * DM. Nobody is watching the server, so the server has to do the telling.
 */
export async function alertAdmins(text: string): Promise<number> {
  let sent = 0;

  for (const slackUserId of await adminSlackIds()) {
    try {
      const slack = getSlackClient();
      const channel = await existingDirectMessage(slackUserId);
      if (!channel) throw new Error("no direct message channel with this person");

      await slack.chat.postMessage({
        channel,
        markdown_text: text,
        unfurl_links: false,
        unfurl_media: false,
      });
      sent++;
    } catch (error) {
      log.error("could not alert admin", { slackUserId, error: errorMessage(error) });
    }
  }

  log.info("alerted admins", { sent });
  return sent;
}
