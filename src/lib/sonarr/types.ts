export interface SonarrLanguage {
	id: number;
	name: string;
}

export interface SonarrImage {
	coverType: string;
	url: string;
	remoteUrl: string;
}

export interface SonarrRating {
	votes: number;
	value: number;
	type: string;
}

export interface SonarrRatings {
	imdb?: SonarrRating;
	tmdb?: SonarrRating;
	metacritic?: SonarrRating;
	rottenTomatoes?: SonarrRating;
}

export interface SonarrAlternateTitles {
	title: string;
	sceneSeasonNumber?: number;
}

export interface SonarrSeason {
	seasonNumber: number;
	monitored: boolean;
	statistics?: {
		episodeFileCount: number;
		episodeCount: number;
		totalEpisodeCount: number;
		sizeOnDisk: number;
		percentOfEpisodes: number;
	};
}

export interface SonarrStatistics {
	seasonCount: number;
	episodeFileCount: number;
	episodeCount: number;
	totalEpisodeCount: number;
	sizeOnDisk: number;
	percentOfEpisodes: number;
}

export interface SonarrQualityInfo {
	quality: {
		id: number;
		name: string;
		source: string;
		resolution: number;
		modifier?: string;
	};
	revision: {
		version: number;
		real: number;
		isRepack: boolean;
	};
}

export interface SonarrSeries {
	id: number;
	title: string;
	alternateTitles: SonarrAlternateTitles[];
	sortTitle: string;
	status: string;
	ended: boolean;
	overview: string;
	previousAiring?: string;
	nextAiring?: string;
	network: string;
	airTime: string;
	images: SonarrImage[];
	originalLanguage: SonarrLanguage;
	seasons: SonarrSeason[];
	year: number;
	path: string;
	qualityProfileId: number;
	languageProfileId: number;
	seasonFolder: boolean;
	monitored: boolean;
	useSceneNumbering: boolean;
	runtime: number;
	tvdbId: number;
	tvRageId: number;
	tvMazeId: number;
	tmdbId?: number;
	firstAired: string;
	seriesType: string;
	cleanTitle: string;
	imdbId?: string;
	titleSlug: string;
	rootFolderPath: string;
	certification?: string;
	genres: string[];
	tags: string[];
	added: string;
	ratings: SonarrRatings;
	statistics: SonarrStatistics;
}

export interface SonarrEpisodeFile {
	id: number;
	seriesId: number;
	seasonNumber: number;
	relativePath: string;
	path: string;
	size: number;
	dateAdded: string;
	sceneName?: string;
	releaseGroup?: string;
	quality: SonarrQualityInfo;
	indexerFlags: string;
	mediaInfo?: {
		audioChannels: number;
		audioCodec: string;
		audioLanguages: string;
		height: number;
		width: number;
		resolution: string;
		runTime: string;
		scanType: string;
		subtitles: string;
		videoCodec: string;
		videoFps: number;
		videoDynamicRange: string;
		videoDynamicRangeType: string;
	};
	originalFilePath?: string;
	qualityCutoffNotMet: boolean;
}

export interface SonarrEpisode {
	id: number;
	seriesId: number;
	tvdbId?: number;
	episodeFileId?: number;
	seasonNumber: number;
	episodeNumber: number;
	title: string;
	airDate?: string;
	airDateUtc?: string;
	overview?: string;
	episodeFile?: SonarrEpisodeFile;
	hasFile: boolean;
	monitored: boolean;
	absoluteEpisodeNumber?: number;
	sceneAbsoluteEpisodeNumber?: number;
	sceneEpisodeNumber?: number;
	sceneSeasonNumber?: number;
	unverifiedSceneNumbering: boolean;
	grabbed: boolean;
}

export interface SonarrStatusMessage {
	title: string;
	messages: string[];
}

export interface SonarrQueueItem {
	id: number;
	seriesId?: number;
	episodeId?: number;
	seasonNumber?: number;
	series: SonarrSeries;
	episode: SonarrEpisode;
	languages?: SonarrLanguage[];
	quality: SonarrQualityInfo;
	customFormats?: Array<{
		id: number;
		name: string;
		includeCustomFormatWhenRenaming?: boolean;
		// specifications omitted for brevity
	}>;
	customFormatScore?: number;
	size: number;
	title: string;
	estimatedCompletionTime?: string;
	added?: string;
	status: string;
	trackedDownloadStatus?: string;
	trackedDownloadState?: string;
	statusMessages?: SonarrStatusMessage[];
	errorMessage?: string;
	downloadId?: string;
	protocol: string;
	downloadClient?: string;
	downloadClientHasPostImportCategory?: boolean;
	indexer?: string;
	outputPath?: string;
	episodeHasFile?: boolean;
}

export interface SonarrQueueResponse {
	page: number;
	pageSize: number;
	sortKey: string;
	sortDirection: string;
	totalRecords: number;
	records: SonarrQueueItem[];
}

export interface SonarrQualityProfile {
	id: number;
	name: string;
	upgradeAllowed: boolean;
	cutoff: number;
	items: Array<{
		quality?: {
			id: number;
			name: string;
			source: string;
			resolution: number;
		};
		items?: Array<{
			quality: {
				id: number;
				name: string;
				source: string;
				resolution: number;
			};
			allowed: boolean;
		}>;
		allowed: boolean;
	}>;
}

export interface SonarrRootFolder {
	id: number;
	path: string;
	accessible: boolean;
	freeSpace: number;
	unmappedFolders: Array<{
		name: string;
		path: string;
	}>;
}
