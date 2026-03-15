import { Type } from "@sinclair/typebox";
import type { AgentTool } from "@mariozechner/pi-agent-core";
import { deactivateMovieSubscription, deactivateSeriesSubscriptions } from "../db/subscriptions.ts";

const params = Type.Object({
  userId: Type.String({
    description: "The app user ID (UUID) of the user to unsubscribe",
  }),
  mediaType: Type.Union([Type.Literal("movie"), Type.Literal("series")], {
    description: "Whether this is a movie or series",
  }),
  radarrId: Type.Optional(
    Type.Number({
      description: "The Radarr movie ID (required for movies)",
    }),
  ),
  sonarrId: Type.Optional(
    Type.Number({
      description: "The Sonarr series ID (required for series)",
    }),
  ),
  seasonNumber: Type.Optional(
    Type.Number({
      description:
        "Season number for season-scoped unsubscribe (series only). Omit to unsubscribe from the whole series.",
    }),
  ),
});

export const unsubscribeNotificationsTool: AgentTool<typeof params> = {
  name: "unsubscribe_notifications",
  description:
    "Opt a user out of download notifications for a specific movie or series. Uses the Radarr/Sonarr ID to match the subscription precisely. For series, you can optionally scope to a specific season. Use this when a user says they don't want to be notified about a specific title anymore.",
  parameters: params,
  label: "Unsubscribing from notifications",
  async execute(_toolCallId, params) {
    let count = 0;

    if (params.mediaType === "movie") {
      if (!params.radarrId) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                success: false,
                message: "radarrId is required for movie unsubscribe",
              }),
            },
          ],
          details: undefined,
        };
      }
      count = await deactivateMovieSubscription(params.userId, params.radarrId);
    } else {
      if (!params.sonarrId) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                success: false,
                message: "sonarrId is required for series unsubscribe",
              }),
            },
          ],
          details: undefined,
        };
      }
      count = await deactivateSeriesSubscriptions(
        params.userId,
        params.sonarrId,
        params.seasonNumber,
      );
    }

    if (count === 0) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: false,
              message: "No active subscription found to deactivate",
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
            deactivatedCount: count,
            message: `Unsubscribed from ${count} notification${count === 1 ? "" : "s"}`,
          }),
        },
      ],
      details: undefined,
    };
  },
};
