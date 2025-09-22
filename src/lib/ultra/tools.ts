import { tool } from "ai";
import { z } from "zod";

import { createLogger } from "@/lib/logger";
import * as ultraApi from "./api";

const logger = createLogger("ultra/tools");

const ultraStats = tool({
	description:
		"Check storage and traffic usage statistics for the media server. Only provide the information that is relevant to the user's question.",
	inputSchema: z.object({}),
	execute: async () => {
		try {
			const stats = await ultraApi.getTotalStats();
			return {
				freeStorage: stats.service_stats_info.free_storage_gb,
				totalStorage: stats.service_stats_info.total_storage_value,
				usedStorage: stats.service_stats_info.used_storage_value,
			};
		} catch (error) {
			logger.error("Failed to get storage and traffic usage statistics", {
				error,
			});
			return `Failed to get storage and traffic usage statistics: ${JSON.stringify(
				error
			)}`;
		}
	},
});

export const ultraTools = {
	ultraStats,
};
