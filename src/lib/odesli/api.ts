import type { OdesliResponse } from "@/lib/odesli/types";

const API_BASE_URL = "https://api.song.link/v1-alpha.1";

/**
 * Make a request to the Odesli/Songlink API.
 */
async function makeRequest(endpoint: string, params?: Record<string, string>) {
	const url = new URL(`${API_BASE_URL}/${endpoint}`);

	if (params) {
		for (const [key, value] of Object.entries(params)) {
			url.searchParams.append(key, value);
		}
	}

	const response = await fetch(url.toString(), {
		headers: {
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
 * Convert a music streaming link to all available platform links.
 * @param url - The URL of a song on any supported platform (Spotify, Apple Music, etc.)
 * @param userCountry - Optional country code (e.g., "US") for region-specific results
 * @returns Odesli response with links for all available platforms
 */
export async function getLinks(
	url: string,
	userCountry?: string,
): Promise<OdesliResponse> {
	const params: Record<string, string> = { url };

	if (userCountry) {
		params.userCountry = userCountry;
	}

	return (await makeRequest("links", params)) as OdesliResponse;
}
