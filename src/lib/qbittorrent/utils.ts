import type {
	PartialTorrent,
	QbittorrentTorrent,
} from "@/lib/qbittorrent/types";

/**
 * Format bytes to human readable format
 */
function formatBytes(bytes: number): string {
	if (bytes === 0) return "0 B";

	const k = 1024;
	const sizes = ["B", "KB", "MB", "GB", "TB"];
	const i = Math.floor(Math.log(bytes) / Math.log(k));

	return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

/**
 * Format speed to human readable format
 */
function formatSpeed(bytesPerSecond: number): string {
	if (bytesPerSecond === 0) return "0 B/s";

	return `${formatBytes(bytesPerSecond)}/s`;
}

/**
 * Format progress percentage
 */
function formatProgress(progress: number): string {
	return `${(progress * 100).toFixed(1)}%`;
}

/**
 * Format ETA (estimated time remaining)
 */
function formatEta(eta: number): string {
	if (eta === 8640000 || eta <= 0) return "∞";

	const hours = Math.floor(eta / 3600);
	const minutes = Math.floor((eta % 3600) / 60);

	if (hours > 0) {
		return `${hours}h ${minutes}m`;
	} else {
		return `${minutes}m`;
	}
}

/**
 * Format Unix timestamp to readable date
 */
function formatDate(timestamp: number): string {
	if (timestamp === 0) return "Unknown";

	return new Date(timestamp * 1000).toLocaleString();
}

/**
 * Get state display name
 */
function getStateDisplay(state: string): string {
	const stateMap: Record<string, string> = {
		downloading: "Downloading",
		uploading: "Seeding",
		pausedDL: "Paused",
		pausedUP: "Paused",
		queuedDL: "Queued",
		queuedUP: "Queued",
		stalledDL: "Stalled",
		stalledUP: "Stalled",
		checkingDL: "Checking",
		checkingUP: "Checking",
		checkingResumeData: "Checking",
		error: "Error",
		missingFiles: "Missing Files",
		allocating: "Allocating",
		metaDL: "Downloading Metadata",
		forcedDL: "Forced Download",
		forcedUP: "Forced Upload",
	};

	return stateMap[state] || state;
}

/**
 * Convert full torrent object to partial for tool responses
 */
export function toPartialTorrent(torrent: QbittorrentTorrent): PartialTorrent {
	return {
		hash: torrent.hash,
		name: torrent.name,
		size: formatBytes(torrent.size),
		progress: formatProgress(torrent.progress),
		downloadSpeed: formatSpeed(torrent.dlspeed),
		uploadSpeed: formatSpeed(torrent.upspeed),
		state: getStateDisplay(torrent.state),
		eta: formatEta(torrent.eta),
		category: torrent.category || undefined,
		addedOn: formatDate(torrent.added_on),
	};
}
