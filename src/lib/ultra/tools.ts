import { tool } from "ai";
import { z } from "zod";

import { createLogger } from "@/lib/logger";
import * as slackService from "@/lib/slack/service";
import * as ultra from "@/lib/ultra/api";
import type { SlackContext } from "@/types";

const logger = createLogger("ultra/tools");

export function getUltraTools(context: SlackContext) {
	const ultraStats = tool({
		description: "Check storage statistics for the media server.",
		inputSchema: z.object({}),
		execute: async () => {
			try {
				logger.info("calling ultraStats tool", { context });

				slackService.sendToolCallUpdate(context, {
					status: `is checking storage...`,
				});

				const stats = await ultra.getTotalStats();
				return {
					freeStorage: stats.service_stats_info.free_storage_gb,
					totalStorage: stats.service_stats_info.total_storage_value,
					usedStorage: stats.service_stats_info.used_storage_value,
				};
			} catch (error) {
				logger.error("Failed to get storage statistics", {
					context,
					error,
				});

				return `Failed to get storage statistics: ${JSON.stringify(error)}`;
			}
		},
	});

	return {
		ultraStats,
	};
}
