export interface RadarrLanguage {
	id: number;
	name: string;
}

export interface RadarrImage {
	coverType: string;
	url: string;
	remoteUrl: string;
}

export interface RadarrQuality {
	id: number;
	name: string;
	source: string;
	resolution: number;
	modifier: string;
}

export interface RadarrQualityRevision {
	version: number;
	real: number;
	isRepack: boolean;
}

export interface RadarrQualityInfo {
	quality: RadarrQuality;
	revision: RadarrQualityRevision;
}

export interface RadarrRating {
	votes: number;
	value: number;
	type: string;
}

export interface RadarrRatings {
	imdb?: RadarrRating;
	tmdb?: RadarrRating;
	metacritic?: RadarrRating;
	rottenTomatoes?: RadarrRating;
	trakt?: RadarrRating;
}

export interface RadarrMediaInfo {
	audioBitrate: number;
	audioChannels: number;
	audioCodec: string;
	audioLanguages: string;
	audioStreamCount: number;
	videoBitDepth: number;
	videoBitrate: number;
	videoCodec: string;
	videoFps: number;
	videoDynamicRange: string;
	videoDynamicRangeType: string;
	resolution: string;
	runTime: string;
	scanType: string;
	subtitles: string;
}

export interface RadarrMovieFile {
	movieId: number;
	relativePath: string;
	path: string;
	size: number;
	dateAdded: string;
	sceneName: string;
	releaseGroup: string;
	edition: string;
	languages: RadarrLanguage[];
	quality: RadarrQualityInfo;
	indexerFlags: number;
	mediaInfo: RadarrMediaInfo;
	originalFilePath: string;
	qualityCutoffNotMet: boolean;
	id: number;
}

export interface RadarrStatistics {
	movieFileCount: number;
	sizeOnDisk: number;
	releaseGroups: string[];
}

export interface RadarrMovie {
	id: number;
	title: string;
	originalTitle: string;
	originalLanguage: RadarrLanguage;
	alternateTitles: string[];
	secondaryYearSourceId: number;
	sortTitle: string;
	sizeOnDisk: number;
	status: string;
	overview: string;
	inCinemas?: string;
	physicalRelease?: string;
	digitalRelease?: string;
	remotePoster?: string;
	releaseDate?: string;
	images: RadarrImage[];
	website?: string;
	year: number;
	youTubeTrailerId?: string;
	studio?: string;
	path: string;
	qualityProfileId: number;
	hasFile: boolean;
	movieFileId?: number;
	monitored: boolean;
	minimumAvailability: string;
	isAvailable: boolean;
	folderName: string;
	runtime: number;
	cleanTitle: string;
	imdbId?: string;
	tmdbId: number;
	titleSlug: string;
	rootFolderPath: string;
	certification?: string;
	genres: string[];
	keywords: string[];
	tags: string[];
	added: string;
	ratings: RadarrRatings;
	movieFile?: RadarrMovieFile;
	popularity: number;
	lastSearchTime?: string;
	statistics: RadarrStatistics;
}

export interface RadarrQueueItem {
	id: number;
	movie: RadarrMovie;
	quality: RadarrQualityInfo;
	size: number;
	sizeleft: number;
	title: string;
	timeLeft?: string;
	estimatedCompletionTime?: string;
	status: string;
	trackedDownloadStatus?: string;
	trackedDownloadState?: string;
	statusMessages?: string[];
	errorMessage?: string;
	downloadId?: string;
	protocol: string;
	downloadClient?: string;
	downloadClientHasPostImportCategory?: boolean;
	indexer?: string;
	outputPath?: string;
}

export interface RadarrQueueResponse {
	page: number;
	pageSize: number;
	sortKey: string;
	sortDirection: string;
	totalRecords: number;
	records: RadarrQueueItem[];
}

export interface RadarrCustomFormatSpecification {
	id: number;
	name: string;
	implementation: string;
	implementationName: string;
	infoLink?: string;
	negate: boolean;
	required: boolean;
	fields: Array<Record<string, unknown>>;
	presets?: string[];
}

export interface RadarrCustomFormat {
	id: number;
	name: string;
	includeCustomFormatWhenRenaming?: boolean;
	specifications?: RadarrCustomFormatSpecification[];
}

export interface RadarrHistoryRecord {
	id: number;
	movieId: number;
	sourceTitle: string;
	languages: RadarrLanguage[];
	quality: RadarrQualityInfo;
	customFormats?: RadarrCustomFormat[];
	customFormatScore?: number;
	qualityCutoffNotMet?: boolean;
	date: string;
	downloadId?: string;
	eventType: string;
	data?: Record<string, unknown>;
	movie?: RadarrMovie;
}

export interface RadarrHistoryResponse {
	page: number;
	pageSize: number;
	sortKey: string;
	sortDirection: string;
	totalRecords: number;
	records: RadarrHistoryRecord[];
}
