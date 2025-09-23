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

	const text = await response.text();
	let json: unknown;
	try {
		json = JSON.parse(text);
	} catch (error) {
		json = text;
	}

	if (!response.ok) {
		throw {
			response,
			status: response.status,
			statusText: response.statusText,
			body: json,
		};
	}

	try {
		return json;
	} catch (error) {
		return undefined;
	}
}

/**
 * Get total stats from Ultra API.
 */
export async function getTotalStats(): Promise<UltraStats> {
	return (await makeRequest("total-stats")) as UltraStats;
}
