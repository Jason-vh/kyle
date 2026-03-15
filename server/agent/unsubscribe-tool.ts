import { Type } from "@sinclair/typebox";
import { sql } from "drizzle-orm";
import type { AgentTool } from "@mariozechner/pi-agent-core";
import { db } from "../db/index.ts";

const params = Type.Object({
  userId: Type.String({
    description: "The app user ID (UUID) of the user to unsubscribe",
  }),
  title: Type.String({
    description: "The media title to stop notifications for",
  }),
  mediaType: Type.Union([Type.Literal("movie"), Type.Literal("series")], {
    description: "Whether this is a movie or series",
  }),
});

export const unsubscribeNotificationsTool: AgentTool<typeof params> = {
  name: "unsubscribe_notifications",
  description:
    "Opt a user out of download notifications for a specific movie or series they requested. The media ref is preserved but future webhook notifications will skip this user for that title. Use this when a user says they don't want to be notified about a specific title anymore.",
  parameters: params,
  label: "Unsubscribing from notifications",
  async execute(_toolCallId, params) {
    const result = await db.execute<{ count: string }>(sql`
      UPDATE media_refs
      SET notify = false
      WHERE action = 'add'
        AND user_id = ${params.userId}
        AND title ILIKE ${params.title}
        AND media_type = ${params.mediaType}
      RETURNING id
    `);

    const count = result.length;

    if (count === 0) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: false,
              message: `No matching media requests found for "${params.title}" (${params.mediaType})`,
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
            updatedCount: count,
            message: `Unsubscribed from notifications for "${params.title}" (${params.mediaType})`,
          }),
        },
      ],
      details: undefined,
    };
  },
};
