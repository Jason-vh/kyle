import { eq, asc } from "drizzle-orm";
import { db } from "./index.ts";
import { webhookNotifications } from "./schema.ts";
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
 * Save a webhook notification linked to the given conversation.
 * Non-fatal — logs errors but doesn't throw.
 */
export async function saveWebhookNotification(
  conversationId: string,
  source: "sonarr" | "radarr",
  message: string,
  payload: WebhookNotificationPayload,
): Promise<void> {
  try {
    await db.insert(webhookNotifications).values({
      conversationId,
      source,
      message,
      payload,
    });

    log.info("saved webhook notification", {
      conversationId,
      source,
      title: payload.title,
    });
  } catch (error) {
    log.error("failed to save webhook notification", {
      conversationId,
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
