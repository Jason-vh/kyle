/**
 * Radarr webhook payload for Download events
 * https://wiki.servarr.com/radarr/settings#webhook
 */
export interface RadarrWebhookPayload {
	eventType: "Download" | "Upgrade" | "Test";
	movie: {
		id: number;
		title: string;
		year: number;
		tmdbId: number;
		imdbId?: string;
		overview?: string;
	};
	remoteMovie?: {
		tmdbId: number;
		imdbId?: string;
		title: string;
		year: number;
	};
	release?: {
		quality: string;
		qualityVersion: number;
		releaseGroup?: string;
		releaseTitle?: string;
		indexer?: string;
		size: number;
	};
	downloadClient?: string;
	downloadId?: string;
}

/**
 * Sonarr webhook payload for Download events
 * https://wiki.servarr.com/sonarr/settings#webhook
 */
export interface SonarrWebhookPayload {
	eventType: "Download" | "Upgrade" | "Test";
	series: {
		id: number;
		title: string;
		titleSlug: string;
		path: string;
		tvdbId: number;
		tvMazeId?: number;
		imdbId?: string;
		type: string;
		year: number;
	};
	episodes: Array<{
		id: number;
		episodeNumber: number;
		seasonNumber: number;
		title: string;
		overview?: string;
		airDate?: string;
		airDateUtc?: string;
		seriesId: number;
		tvdbId?: number;
	}>;
	episodeFile?: {
		id: number;
		relativePath: string;
		path: string;
		size: number;
		dateAdded: string;
		releaseGroup?: string;
		seasonNumber: number;
		seriesId: number;
	};
	release?: {
		quality: string;
		qualityVersion: number;
		releaseGroup?: string;
		releaseTitle?: string;
		indexer?: string;
		size: number;
	};
	downloadClient?: string;
	downloadId?: string;
}

/**
 * Unified media info for notifications
 */
export interface MediaNotificationInfo {
	mediaType: "movie" | "series";
	title: string;
	year: number;
	quality?: string;
	releaseGroup?: string;
	// For series only
	episodes?: Array<{
		seasonNumber: number;
		episodeNumber: number;
		title: string;
	}>;
}

/**
 * Requester info from database lookup
 */
export interface MediaRequester {
	userId: string;
	threadTs: string;
	channelId: string;
	title: string | null;
}
