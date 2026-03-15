import { Type } from "@sinclair/typebox";
import type { AgentTool } from "@mariozechner/pi-agent-core";
import { and, eq, ilike } from "drizzle-orm";
import { createLogger } from "../logger.ts";
import { db } from "../db/index.ts";
import { mediaRefs } from "../db/schema.ts";

const log = createLogger("unsubscribe-tool");

const params = Type.Object({
  userId: Type.String({
    description: "The app user ID (UUID) to unsubscribe for",
  }),
  title: Type.String({
    description: "The title of the media to stop notifications for",
  }),
  mediaType: Type.Union([Type.Literal("movie"), Type.Literal("series")], {
    description: "The type of media",
  }),
});

export const unsubscribeNotificationsTool: AgentTool<typeof params> = {
  name: "unsubscribe_notifications",
  description:
    "Stop download notifications for a specific movie or TV series. Removes the user's media tracking so they won't receive messages when it finishes downloading. The userId parameter is the app user UUID shown in conversation context.",
  parameters: params,
  label: "Updating notification preferences",
  async execute(_toolCallId, params) {
    const deleted = await db
      .delete(mediaRefs)
      .where(
        and(
          eq(mediaRefs.action, "add"),
          eq(mediaRefs.userId, params.userId),
          ilike(mediaRefs.title, params.title),
          eq(mediaRefs.mediaType, params.mediaType),
        ),
      )
      .returning({ id: mediaRefs.id, title: mediaRefs.title });

    log.info("unsubscribed from notifications", {
      userId: params.userId,
      title: params.title,
      mediaType: params.mediaType,
      deletedCount: deleted.length,
    });

    if (deleted.length === 0) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: true,
              message: `No active notification subscriptions found for "${params.title}". The user may not have been subscribed.`,
            }),
          },
        ],
        details: undefined,
      };
    }

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            success: true,
            message: `Unsubscribed from download notifications for "${deleted[0]!.title}".`,
            removedCount: deleted.length,
          }),
        },
      ],
      details: undefined,
    };
  },
};
