export interface QbittorrentTorrent {
	hash: string;
	name: string;
	size: number;
	progress: number;
	dlspeed: number;
	upspeed: number;
	priority: number;
	num_seeds: number;
	num_leechs: number;
	ratio: number;
	eta: number;
	state: string;
	category: string;
	tags: string;
	added_on: number;
	completion_on: number;
	tracker: string;
	dl_limit: number;
	up_limit: number;
	downloaded: number;
	uploaded: number;
	downloaded_session: number;
	uploaded_session: number;
	amount_left: number;
	save_path: string;
	completed: number;
	max_ratio: number;
	max_seeding_time: number;
	ratio_limit: number;
	seeding_time_limit: number;
	seen_complete: number;
	last_activity: number;
	time_active: number;
	auto_tmm: boolean;
	total_size: number;
}

export interface QbittorrentAuthResponse {
	status: string;
}

export interface PartialTorrent {
	hash: string;
	name: string;
	size: string;
	progress: string;
	downloadSpeed: string;
	uploadSpeed: string;
	state: string;
	eta: string;
	category?: string;
	addedOn: string;
}