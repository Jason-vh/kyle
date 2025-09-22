import { createLogger } from "@/lib/logger";
import type { QbittorrentTorrent } from "@/lib/qbittorrent/types";

const logger = createLogger("qbittorrent/api");

// Store session cookie
let sessionCookie: string | null = null;

/**
 * Authenticate with qBittorrent and get session cookie
 */
async function authenticate(): Promise<void> {
	const url = `${Bun.env.QBITTORRENT_HOST}/api/v2/auth/login`;

	logger.debug("authenticating with qBittorrent", { url });

	const formData = new URLSearchParams();
	formData.append("username", Bun.env.QBITTORRENT_USERNAME || "");
	formData.append("password", Bun.env.QBITTORRENT_PASSWORD || "");

	const response = await fetch(url, {
		method: "POST",
		headers: {
			"Content-Type": "application/x-www-form-urlencoded",
		},
		body: formData,
	});

	if (!response.ok) {
		throw new Error(
			`Authentication failed: ${response.status} ${response.statusText}`
		);
	}

	// Extract session cookie from response
	const setCookieHeader = response.headers.get("set-cookie");
	if (setCookieHeader) {
		const sidMatch = setCookieHeader.match(/SID=([^;]+)/);
		if (sidMatch) {
			sessionCookie = `SID=${sidMatch[1]}`;
			logger.debug("authentication successful", { sessionCookie: "***" });
		} else {
			throw new Error("No SID cookie found in authentication response");
		}
	} else {
		throw new Error("No set-cookie header in authentication response");
	}
}

/**
 * Make an authenticated request to qBittorrent API
 */
async function makeRequest(
	endpoint: string,
	options: RequestInit = {}
): Promise<any> {
	// Authenticate if we don't have a session cookie
	if (!sessionCookie) {
		await authenticate();
	}

	const url = `${Bun.env.QBITTORRENT_HOST}/api/v2${endpoint}`;

	logger.debug("making request", { url, options });

	const response = await fetch(url, {
		...options,
		headers: {
			Cookie: sessionCookie || "",
			...options.headers,
		},
	});

	// If we get 403, try to re-authenticate once
	if (response.status === 403 && sessionCookie) {
		logger.debug("got 403, trying to re-authenticate");
		sessionCookie = null;
		await authenticate();

		// Retry the request with new session
		const retryResponse = await fetch(url, {
			...options,
			headers: {
				Cookie: sessionCookie || "",
				...options.headers,
			},
		});

		if (!retryResponse.ok) {
			throw {
				response: retryResponse,
				status: retryResponse.status,
				statusText: retryResponse.statusText,
				body: await retryResponse.text(),
			};
		}

		return retryResponse.json();
	}

	if (!response.ok) {
		throw {
			response,
			status: response.status,
			statusText: response.statusText,
			body: await response.text(),
		};
	}

	const text = await response.text();

	// Handle empty responses
	if (!text) {
		return null;
	}

	try {
		return JSON.parse(text);
	} catch (error) {
		return text;
	}
}

/**
 * Get list of torrents with optional filters
 */
export async function getTorrents(
	filter?: string
): Promise<QbittorrentTorrent[]> {
	const params = new URLSearchParams();
	if (filter) {
		params.append("filter", filter);
	}

	const endpoint = `/torrents/info${
		params.toString() ? `?${params.toString()}` : ""
	}`;
	return (await makeRequest(endpoint)) as QbittorrentTorrent[];
}
