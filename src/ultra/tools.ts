import { Type } from "@sinclair/typebox";
import type { AgentTool } from "@mariozechner/pi-agent-core";
import * as ultra from "./api.ts";

const emptyParams = Type.Object({});

export const getUltraStatsTool: AgentTool<typeof emptyParams> = {
	name: "get_ultra_stats",
	description:
		"Get Ultra seedbox storage and traffic stats including free/used/total storage and traffic usage",
	parameters: emptyParams,
	label: "Checking Ultra seedbox stats",
	async execute() {
		const stats = await ultra.getStats();
		return {
			content: [
				{
					type: "text",
					text: JSON.stringify({
						freeStorageGB: stats.free_storage_gb,
						usedStorageGB: stats.used_storage_value,
						totalStorageGB: stats.total_storage_value,
						trafficUsedPercent: stats.traffic_used_percentage,
						trafficAvailablePercent: stats.traffic_available_percentage,
						lastTrafficReset: stats.last_traffic_reset,
						nextTrafficReset: stats.next_traffic_reset,
					}),
				},
			],
			details: undefined,
		};
	},
};
