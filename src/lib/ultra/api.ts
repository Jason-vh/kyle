import type { UltraStats } from "@/lib/ultra/types";

/**
 * Make a request to the Ultra API.
 */
async function makeRequest(endpoint: string) {
	if (!Bun.env.ULTRA_API_TOKEN) {
		throw new Error("ULTRA_API_TOKEN must be set");
	}

	if (!Bun.env.ULTRA_HOST) {
		throw new Error("ULTRA_HOST must be set");
	}

	const url = `${Bun.env.ULTRA_HOST}/${endpoint}`;
	const response = await fetch(url, {
		headers: {
			Authorization: `Bearer ${Bun.env.ULTRA_API_TOKEN}`,
			"Content-Type": "application/json",
		},
	});

	if (!response.ok) {
		throw {
			status: response.status,
			statusText: response.statusText,
			body: await response.json(),
		};
	}

	return response.json();
}

/**
 * Get total stats from Ultra API.
 */
export async function getTotalStats(): Promise<UltraStats> {
	return (await makeRequest("total-stats")) as UltraStats;
}
