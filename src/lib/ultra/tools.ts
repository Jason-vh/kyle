import { tool } from "ai";
import { z } from "zod";

import { createLogger } from "@/lib/logger";
import * as slack from "@/lib/slack/api";
import * as slackService from "@/lib/slack/service";
import * as ultra from "@/lib/ultra/api";
import type { SlackContext } from "@/types";

const logger = createLogger("ultra/tools");

export function getUltraTools(context: SlackContext) {
	const ultraStats = tool({
		description:
			"Check storage and traffic usage statistics for the media server. Only provide the information that is relevant to the user's question.",
		inputSchema: z.object({}),
		onInputStart: async () => {
			await slackService.appendToStream(
				context,
				":ultra: _Checking storage_\n"
			);
		},
		execute: async () => {
			try {
				logger.info("calling ultraStats tool", { context });

				slack.setThreadStatus({
					channel_id: context.slack_channel_id,
					thread_ts: context.slack_thread_ts,
					status: `is counting bytes...`,
				});

				const stats = await ultra.getTotalStats();
				return {
					freeStorage: stats.service_stats_info.free_storage_gb,
					totalStorage: stats.service_stats_info.total_storage_value,
					usedStorage: stats.service_stats_info.used_storage_value,
				};
			} catch (error) {
				logger.error("Failed to get storage and traffic usage statistics", {
					context,
					error,
				});

				return `Failed to get storage and traffic usage statistics: ${JSON.stringify(
					error
				)}`;
			}
		},
	});

	return {
		ultraStats,
	};
}
