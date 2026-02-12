const ULTRA_HOST = process.env.ULTRA_HOST;
const ULTRA_API_TOKEN = process.env.ULTRA_API_TOKEN;

export interface UltraStats {
	free_storage_bytes: number;
	free_storage_gb: number;
	last_traffic_reset: string;
	next_traffic_reset: string;
	total_storage_unit: string;
	total_storage_value: number;
	traffic_available_percentage: number;
	traffic_used_percentage: number;
	used_storage_unit: string;
	used_storage_value: number;
}

interface UltraStatsResponse {
	service_stats_info: UltraStats;
}

async function makeRequest(endpoint: string): Promise<unknown> {
	if (!ULTRA_HOST || !ULTRA_API_TOKEN) {
		throw new Error(
			"ULTRA_HOST and ULTRA_API_TOKEN environment variables are required",
		);
	}

	const url = `${ULTRA_HOST}/ultra-api${endpoint}`;

	const response = await fetch(url, {
		headers: {
			Authorization: `Bearer ${ULTRA_API_TOKEN}`,
		},
	});

	if (!response.ok) {
		throw {
			status: response.status,
			statusText: response.statusText,
			body: await response.text(),
		};
	}

	return response.json();
}

export async function getStats(): Promise<UltraStats> {
	const data = (await makeRequest("/total_stats")) as UltraStatsResponse;
	return data.service_stats_info;
}
