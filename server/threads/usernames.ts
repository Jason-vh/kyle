import { inArray } from "drizzle-orm";
import { createLogger } from "../logger.ts";
import { errorMessage } from "../errors.ts";
import { db } from "../db/index.ts";
import { users } from "../db/schema.ts";
import { resolveUsernames } from "../slack/users.ts";
import { resolveDiscordUsernames } from "../discord/users.ts";

const log = createLogger("threads:usernames");

/** A row that carries an author, either a linked app user or a platform-native one. */
export interface AuthoredRow {
  userId: string | null;
  platformUserId: string | null;
}

/**
 * Resolves display names for a batch of rows in as few lookups as possible,
 * preferring a linked app user's name over the platform directory.
 */
export async function createUsernameResolver(
  interfaceType: string,
  rows: AuthoredRow[],
): Promise<(row: AuthoredRow) => string | null> {
  const appUserIds = [...new Set(rows.map((r) => r.userId).filter((id) => id !== null))];
  const appNames = new Map<string, string>();
  if (appUserIds.length > 0) {
    const appUsers = await db
      .select({ id: users.id, displayName: users.displayName })
      .from(users)
      .where(inArray(users.id, appUserIds));
    for (const user of appUsers) appNames.set(user.id, user.displayName);
  }

  const platformIds = [
    ...new Set(
      rows
        .filter((r) => !r.userId)
        .map((r) => r.platformUserId)
        .filter((id) => id !== null),
    ),
  ];
  let platformNames = new Map<string, string>();
  if (platformIds.length > 0) {
    try {
      platformNames =
        interfaceType === "discord"
          ? await resolveDiscordUsernames(platformIds)
          : await resolveUsernames(platformIds);
    } catch (error) {
      log.warn("failed to resolve usernames", {
        platformUserIds: platformIds,
        error: errorMessage(error),
      });
    }
  }

  return (row) =>
    (row.userId && appNames.get(row.userId)) ??
    (row.platformUserId && platformNames.get(row.platformUserId)) ??
    null;
}
