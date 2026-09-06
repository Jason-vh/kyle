import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import type { AppNotification, LibraryMediaType } from "#shared/types.ts";
import { db } from "./index.ts";
import { notifications } from "./schema.ts";
import { createLogger } from "#server/logger.ts";
import { errorMessage } from "#server/errors.ts";

const log = createLogger("notifications");

/** Enough to scroll in a popover; older ones stop being news. */
const PAGE_SIZE = 30;

export interface NewNotification {
  mediaType: LibraryMediaType;
  title: string;
  body: string;
  tmdbId?: number;
  serviceId?: number;
}

/**
 * Tell several people the same thing. Non-fatal: failing to record a
 * notification must not stop the chat reply that goes out beside it.
 */
export async function saveNotifications(
  userIds: string[],
  notification: NewNotification,
): Promise<number> {
  if (userIds.length === 0) return 0;

  try {
    const rows = await db
      .insert(notifications)
      .values(userIds.map((userId) => ({ userId, ...notification })))
      .returning({ id: notifications.id });

    log.info("recorded notifications", { count: rows.length, title: notification.title });
    return rows.length;
  } catch (error) {
    log.error("could not record notifications", {
      title: notification.title,
      error: errorMessage(error),
    });
    return 0;
  }
}

export async function listNotifications(userId: string): Promise<AppNotification[]> {
  const rows = await db
    .select()
    .from(notifications)
    .where(eq(notifications.userId, userId))
    .orderBy(desc(notifications.createdAt))
    .limit(PAGE_SIZE);

  return rows.map((row) => ({
    id: row.id,
    mediaType: row.mediaType,
    title: row.title,
    body: row.body,
    read: row.readAt !== null,
    createdAt: row.createdAt.toISOString(),
  }));
}

export async function countUnread(userId: string): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));

  return row?.count ?? 0;
}

/** Marks the given notifications read, or every unread one when none are named. */
export async function markRead(userId: string, ids?: string[]): Promise<number> {
  const mine = and(eq(notifications.userId, userId), isNull(notifications.readAt));

  const rows = await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(ids?.length ? and(mine, inArray(notifications.id, ids)) : mine)
    .returning({ id: notifications.id });

  return rows.length;
}
