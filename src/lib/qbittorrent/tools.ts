import { tool } from "ai";
import { z } from "zod";

import { createLogger } from "@/lib/logger";
import * as qbittorrent from "@/lib/qbittorrent/api";
import { toPartialTorrent } from "@/lib/qbittorrent/utils";
import * as slack from "@/lib/slack/api";
import * as slackService from "@/lib/slack/service";
import type { SlackContext } from "@/types";

const logger = createLogger("qbittorrent/tools");

export function getQbittorrentTools(context: SlackContext) {
	const getTorrents = tool({
		description: "Get list of torrents from qBittorrent with optional filter",
		inputSchema: z.object({
			filter: z
				.enum([
					"all",
					"downloading",
					"completed",
					"paused",
					"active",
					"inactive",
					"resumed",
					"stalled",
					"stalled_uploading",
					"stalled_downloading",
					"errored",
				])
				.optional()
				.describe(
					"Filter torrents by state. Default is 'all' if not specified."
				),
		}),
		execute: async ({ filter }) => {
			try {
				logger.info("calling getTorrents tool", { filter, context });

				slack.setThreadStatus({
					channel_id: context.slack_channel_id,
					thread_ts: context.slack_thread_ts,
					status: "is looking up torrents...",
				});

				slackService.appendToStream(
					context,
					`I'm fetching the list of torrents from qBittorrent\n`
				);

				const torrents = await qbittorrent.getTorrents(filter);
				const results = torrents.map(toPartialTorrent);

				logger.info("successfully retrieved torrents", {
					filter,
					count: results.length,
					context,
				});

				return {
					totalCount: results.length,
					filter: filter || "all",
					torrents: results,
				};
			} catch (error) {
				logger.error("Failed to get torrents", { filter, error, context });
				return `Failed to get torrents: ${JSON.stringify(error)}`;
			}
		},
	});

	const deleteTorrents = tool({
		description: "Delete torrents from qBittorrent by hash.",
		inputSchema: z.object({
			hashes: z
				.array(z.string())
				.min(1)
				.describe("Array of torrent hashes to delete"),
		}),
		execute: async ({ hashes }) => {
			try {
				logger.info("calling deleteTorrents tool", {
					hashes,
					context,
				});

				slackService.appendToStream(
					context,
					`I'm removing ${hashes.length} torrent(s) from qBittorrent\n`
				);

				slack.setThreadStatus({
					channel_id: context.slack_channel_id,
					thread_ts: context.slack_thread_ts,
					status: "is removing torrents...",
				});

				await qbittorrent.deleteTorrents(hashes);

				await slackService.sendSystemMessage(
					context,
					`Deleted ${hashes.length} torrent(s)`
				);

				logger.info("successfully deleted torrents", {
					hashes,
					context,
				});

				return {
					success: true,
					deletedCount: hashes.length,
					message: `Successfully deleted ${hashes.length} torrent(s) and their files. The user has been notified of the deletion.`,
				};
			} catch (error) {
				logger.error("Failed to delete torrents", {
					hashes,
					error,
					context,
				});
				return `Failed to delete torrents: ${JSON.stringify(error)}`;
			}
		},
	});

	return {
		getTorrents,
		deleteTorrents,
	};
}
