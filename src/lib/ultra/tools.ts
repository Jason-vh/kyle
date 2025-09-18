import { tool } from "ai";
import { z } from "zod";

import { handleError } from "@/lib/utils";
import * as ultraApi from "./api";

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
			return handleError(
				"Failed to get storage and traffic usage statistics",
				error
			);
		}
	},
});

export const ultraTools = {
	ultraStats,
};
