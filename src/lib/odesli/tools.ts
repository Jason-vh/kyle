import { tool } from "ai";
import { z } from "zod";

import { createLogger } from "@/lib/logger";
import * as odesli from "@/lib/odesli/api";
import * as slack from "@/lib/slack/api";
import type { SlackContext } from "@/types";
import { toPartialOdesliResponse } from "./utils";

const logger = createLogger("odesli/tools");

export function getOdesliTools(context: SlackContext) {
	const convertMusicLink = tool({
		description:
			"Convert a music streaming link (Spotify, Apple Music, YouTube, etc.) to links for all other available platforms. Use this when the user provides a link to a song on one platform and wants it on another platform (e.g., Spotify to Apple Music).",
		inputSchema: z.object({
			url: z
				.string()
				.describe(
					"The URL of the song on any music streaming platform (Spotify, Apple Music, YouTube Music, Deezer, Tidal, etc.)"
				),
			userCountry: z
				.string()
				.optional()
				.describe(
					"Optional country code (e.g., 'US', 'GB') for region-specific results"
				),
		}),
		execute: async ({ url, userCountry }) => {
			try {
				logger.info("calling convertMusicLink tool", {
					context,
					url,
					userCountry,
				});

				slack.setThreadStatus({
					channel_id: context.slack_channel_id,
					thread_ts: context.slack_thread_ts,
					status: `is vibing to the music...`,
				});

				const songInfo = await odesli.getLinks(url, userCountry);
				const result = toPartialOdesliResponse(songInfo);

				return {
					success: true,
					...result,
				};
			} catch (error) {
				logger.error("Failed to convert music link", {
					context,
					url,
					error,
				});

				return {
					success: false,
					error: `Failed to convert music link: ${JSON.stringify(error)}`,
				};
			}
		},
	});

	return {
		convertMusicLink,
	};
}
