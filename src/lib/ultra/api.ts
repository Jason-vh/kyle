import { UltraStats } from "@/lib/ultra/types";

/**
 * Make a request to the Ultra API.
 */
async function makeRequest(endpoint: string) {
	if (!process.env.ULTRA_API_TOKEN) {
		throw new Error("ULTRA_API_TOKEN must be set");
	}

	const url = `${process.env.ULTRA_BASE_URL}${endpoint}`;
	const response = await fetch(url, {
		headers: {
			Authorization: `Bearer ${process.env.ULTRA_API_TOKEN}`,
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
