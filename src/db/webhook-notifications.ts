import { eq, asc } from "drizzle-orm";
import { db } from "./index.ts";
import { conversations, webhookNotifications } from "./schema.ts";
import type { WebhookNotificationPayload } from "./schema.ts";
import { createLogger } from "../logger.ts";

const log = createLogger("webhook-notifications");

export type { WebhookNotificationPayload };

export interface WebhookNotification {
  id: string;
  source: string;
  message: string;
  payload: WebhookNotificationPayload;
  receivedAt: Date;
}

/**
 * Save a webhook notification linked to the conversation for the given channel:threadTs.
 * Non-fatal — logs errors but doesn't throw.
 */
export async function saveWebhookNotification(
  channel: string,
  threadTs: string,
  source: "sonarr" | "radarr",
  message: string,
  payload: WebhookNotificationPayload,
): Promise<void> {
  try {
    const externalId = `${channel}:${threadTs}`;
    const conv = await db.query.conversations.findFirst({
      where: (c, { and, eq: e }) =>
        and(e(c.externalId, externalId), e(c.interfaceType, "slack")),
    });

    if (!conv) {
      log.warn("conversation not found for webhook notification", { externalId });
      return;
    }

    await db.insert(webhookNotifications).values({
      conversationId: conv.id,
      source,
      message,
      payload,
    });

    log.info("saved webhook notification", {
      conversationId: conv.id,
      source,
      title: payload.title,
    });
  } catch (error) {
    log.error("failed to save webhook notification", {
      channel,
      threadTs,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function getWebhookNotifications(
  conversationId: string,
): Promise<WebhookNotification[]> {
  const rows = await db
    .select()
    .from(webhookNotifications)
    .where(eq(webhookNotifications.conversationId, conversationId))
    .orderBy(asc(webhookNotifications.receivedAt));

  return rows.map((r) => ({
    id: r.id,
    source: r.source,
    message: r.message,
    payload: r.payload,
    receivedAt: r.receivedAt,
  }));
}
