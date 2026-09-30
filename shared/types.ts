// Auth
export interface AuthStatusResponse {
  authenticated: boolean;
  user?: {
    id: string;
    name: string;
    admin: boolean;
    /** Their Plex avatar, when a Plex account is linked and still has access. */
    avatarUrl?: string | null;
  };
}

// Library
export type LibraryMediaType = "movie" | "series";

export function isLibraryMediaType(value: string): value is LibraryMediaType {
  return value === "movie" || value === "series";
}

/** How much of an item is actually on disk. */
export type LibraryAvailability = "available" | "partial" | "missing";

/** What a service holds of one title. */
export interface LibraryState {
  /** Radarr or Sonarr id, and what management acts on. */
  serviceId: number;
  monitored: boolean;
  sizeOnDisk: number;
  availability: LibraryAvailability;
  /** Episode progress for a series, e.g. "12/90 episodes". */
  detail?: string;
  episodes?: { present: number; total: number };
  addedAt?: string;
}

export interface LibraryItem extends LibraryState {
  mediaType: LibraryMediaType;
  tmdbId?: number;
  title: string;
  year?: number;
  posterPath?: string;
  /** Anyone who requested it through Kyle; empty for older media. */
  requestedBy: Person[];
  requestedByMe: boolean;
  /** Anyone who has played it on the Plex server. */
  watchedBy: Watcher[];
  download?: Download;
}

export interface Person {
  name: string;
  thumb?: string;
  you?: boolean;
}

export interface Watcher extends Person {
  /** ISO 8601 of their most recent play; absent when Plex did not say. */
  watchedAt?: string;
}

// People

export interface UserFootprint {
  identities: number;
  passkeys: number;
  requests: number;
  conversations: number;
  messages: number;
  mediaEvents: number;
  movieSubscriptions: number;
  seriesSubscriptions: number;
  notifications: number;
  plexInvites: number;
  removals: number;
  plexAccounts: number;
}

export interface LinkedIdentity {
  id: string;
  platform: string;
  platformUserId: string;
  platformUsername: string | null;
}

export interface LinkablePlexAccount {
  accountId: string;
  name: string;
  username: string;
  thumb?: string;
}

export interface AccountLinks {
  platforms: string[];
  identities: LinkedIdentity[];
}

export interface AdminUser {
  id: string;
  displayName: string;
  avatarUrl?: string;
  isAdmin: boolean;
  createdAt: string;
  identities: LinkedIdentity[];
  footprint: UserFootprint;
  requestedBytes?: number;
}

export interface WatchedTitle {
  mediaType: LibraryMediaType;
  tmdbId?: number;
  title: string;
  year?: number;
  posterPath?: string;
  at: string;
  detail?: string;
}

export interface UserStorage {
  requestedBytes: number;
  libraryBytes: number;
}

export interface UserWatching {
  titles: number;
  plays: number;
  recent: WatchedTitle[];
}

export interface UserInvite {
  email: string;
  at: string;
}

export interface UserRemoval {
  mediaType: LibraryMediaType;
  tmdbId: number;
  title: string;
  at: string;
  deletedFiles: boolean;
}

export interface UserProfile {
  user: AdminUser;
  lastActiveAt?: string;
  requests: MediaRequest[];
  requestsWatched?: { watched: number; total: number };
  storage?: UserStorage;
  /** Absent for someone with no Plex account to have watched anything with. */
  watching?: UserWatching;
  conversations: ThreadListItem[];
  invites: UserInvite[];
  removals: UserRemoval[];
  unavailable: string[];
}

// Media detail

/** One title in full: what TMDB says about it, and what we have of it. */
export interface MediaDetail {
  mediaType: LibraryMediaType;
  tmdbId: number;
  title: string;
  year?: number;
  tagline?: string;
  overview?: string;
  /** TMDB image paths, sized by whoever renders them. */
  posterPath: string | null;
  backdropPath: string | null;
  /** Minutes, per film or per episode. */
  runtime?: number;
  genres: string[];
  /** TMDB's average out of 10, absent when nobody has voted. */
  rating?: number;
  /** A movie only: the earliest date of each kind of release, anywhere. */
  releases?: MovieReleases;
  /** Where it stands, worded as a request is; absent for a title never held. */
  status?: TitleStatus;
  /** Absent when neither Radarr nor Sonarr holds it. */
  library?: LibraryState;
  /** A movie on disk: its resolution, e.g. "4K" or "1080p". */
  quality?: string;
  /** Only for a series in the library, newest concern first: specials last. */
  seasons?: SeasonSummary[];
  /** A series in the library: whether seasons announced later are grabbed too. */
  following?: boolean;
  /** A series in the library: something new is still coming. */
  continuing?: boolean;
  /** 0–1, while downloading. */
  progress?: number;
  /** What the download client thinks is left, e.g. "00:12:31". */
  eta?: string;
  /** Where to watch it, once Plex has scanned it in. */
  plexUrl?: string;
  requestedBy: string[];
  requestedByMe: boolean;
  watchedBy: Watcher[];
  /** Services that could not be reached, so part of this is missing. */
  unavailable: string[];
}

/** ISO 8601 dates, each absent until TMDB knows one. */
export interface MovieReleases {
  cinema?: string;
  digital?: string;
  physical?: string;
}

/** Where a title stands, in the words a request uses. */
export interface TitleStatus {
  state: RequestState;
  /** What the service says about the state: a stall, a rejection, who removed it. */
  detail?: string;
  /** ISO 8601 of when the state began, where the source knows. */
  since?: string;
  /** ISO 8601 of when the title becomes obtainable, while it is not. */
  expectedAt?: string;
  /** Seasons still short of episodes, while the rest of the series is watchable. */
  missing?: MissingSeason[];
}

export type MediaActivityKind = "requested" | "grabbed" | "imported" | "watched" | "removed";

/** One thing that happened to a title. Episodes handled in one sitting read as one. */
export interface MediaActivity {
  id: string;
  kind: MediaActivityKind;
  /** ISO 8601; the latest moment, for several episodes. */
  at: string;
  /** Absent for what the services did on their own. */
  person?: Person;
  /** "Season 2 · 8 episodes", "S01E03 Pilot", "Bluray-1080p" */
  detail?: string;
}

export interface MediaActivityResponse {
  /** Newest first. */
  events: MediaActivity[];
  /** Services that could not be reached, so part of the log is missing. */
  unavailable: string[];
}

/**
 * Where a season stands: everything a request can be, plus the two answers
 * only a season gives. `unrequested` is one nobody has asked for and nothing
 * is watching; `airing` is one up to date with a broadcast still running.
 */
export type SeasonState = RequestState | "unrequested" | "airing";

/** Where a season has got to, and what the source knows about it. */
export interface SeasonStatus {
  state: SeasonState;
  /** What the service says about the state: a stall, a rejection, a bad file. */
  detail?: string;
  /** ISO 8601 of the next episode to air, while one is coming. */
  expectedAt?: string;
  /** ISO 8601 of when the state began, where the source knows. */
  since?: string;
  /** Plex's own page for the series, where a season can be played. */
  plexUrl?: string;
  /** 0–1, while downloading. */
  progress?: number;
  /** What the download client thinks is left, e.g. "00:12:31". */
  eta?: string;
}

/** A season as Sonarr holds it, with the episodes it is made of. */
export interface SeasonSummary extends SeasonStatus {
  /** 0 is Sonarr's specials season. */
  seasonNumber: number;
  monitored: boolean;
  episodeCount: number;
  episodeFileCount: number;
  sizeOnDisk: number;
  episodes: EpisodeSummary[];
  /** Names of anyone who asked for this season in particular. */
  requestedBy: string[];
}

export interface EpisodeSummary {
  episodeNumber: number;
  title: string;
  /** ISO 8601; absent for an episode with no date yet. */
  airDate?: string;
  hasFile: boolean;
  monitored: boolean;
  /** Anyone who has played this episode on the Plex server. */
  watchedBy: Watcher[];
}

// Requests

/**
 * Where a request has got to, worked out live rather than stored. Each says
 * what the requester should expect next, not where the file is.
 */
export type DownloadState = "found" | "downloading" | "stalled" | "blocked" | "importing";

export interface Download {
  state: DownloadState;
  progress?: number;
}

export type RequestState =
  | "unknown"
  | "unreleased"
  | "waiting"
  | "searching"
  | "found"
  | "downloading"
  | "stalled"
  | "blocked"
  | "importing"
  | "ready"
  | "paused"
  | "removed";

/** One season on offer when requesting a series, numbered as Sonarr numbers it. */
export interface SeasonOption {
  /** 0 is specials. */
  seasonNumber: number;
  /** From TMDB, where its numbering agrees. */
  episodeCount?: number;
  year?: number;
}

/** What someone can choose between when requesting a series. */
export interface SeriesRequestOptions {
  /** Regular seasons in order, specials last. */
  seasons: SeasonOption[];
  /** Something new is still coming, so following it means something. */
  continuing: boolean;
}

/** A season of a series that is monitored, aired, and not all there. */
export interface MissingSeason {
  season: number;
  episodes: number;
}

export interface MediaRequest {
  id: string;
  mediaType: LibraryMediaType;
  tmdbId: number;
  title: string;
  year: number | null;
  posterPath: string | null;
  /** Only present when looking at everyone's requests. */
  requestedBy?: Person;
  /** Which season was asked for; null is the series as a whole. */
  seasonNumber: number | null;
  createdAt: string;
  state: RequestState;
  /** What the service says about the state: a stall, a rejection, a bad file. */
  detail?: string;
  /** ISO 8601 of when the title becomes obtainable, while it is not. */
  expectedAt?: string;
  /** ISO 8601 of when the state began, where the source knows. */
  since?: string;
  /** Seasons still short of episodes, while the rest of the series is watchable. */
  missing?: MissingSeason[];
  /** Where to watch it, once Plex has scanned it in. */
  plexUrl?: string;
  /** 0–1, while downloading. */
  progress?: number;
  /** What the download client thinks is left, e.g. "00:12:31". */
  eta?: string;
}

// Notifications

/** Something Kyle has to tell you, whichever interface you asked through. */
export interface AppNotification {
  id: string;
  mediaType: LibraryMediaType;
  tmdbId?: number;
  posterPath?: string;
  /** "Severance (2022)" */
  title: string;
  body: string;
  read: boolean;
  createdAt: string;
}

export interface NotificationsResponse {
  notifications: AppNotification[];
  unread: number;
}

// Dashboard

export interface StorageStat {
  freeBytes: number;
  totalBytes: number;
  /** What the titles someone asked for take up, absent when it cannot be counted. */
  requestedBytes?: number;
}

export interface DashboardStats {
  /** Minutes the Plex server played in the window. */
  watchMinutes?: number;
  /** What became watchable in the window. */
  newMovies?: number;
  newEpisodes?: number;
  storage?: StorageStat;
}

/** Something that landed in the library, and who had asked for it. */
export interface ActivityItem {
  id: string;
  mediaType: LibraryMediaType;
  /** Absent for media the services cannot map to TMDB. */
  tmdbId?: number;
  title: string;
  year?: number;
  /** "S01E04 Good News" for one episode, "Season 1 · 10 episodes" for several. */
  detail?: string;
  posterPath?: string;
  at: string;
  requestedBy: Person[];
  requestedByMe: boolean;
}

export interface DashboardResponse {
  /** How far back the stats and the activity feed look. */
  windowDays: number;
  stats: DashboardStats;
  activity: ActivityItem[];
  requests: MediaRequest[];
  /** Services that could not be reached, so part of this is missing. */
  unavailable: string[];
}

// Thread list
export interface ThreadListItem {
  id: string;
  interfaceType: string;
  preview: string;
  messageCount: number;
  createdAt: string; // ISO 8601
  mediaRefs: { action: string; title: string }[];
}

// Thread detail
export interface ThreadDetail {
  id: string;
  interfaceType: string;
  pageTitle: string;
  createdAt: string;
  mediaRefs: MediaRef[];
  items: ThreadItem[];
}

export type ThreadItem =
  | { kind: "message"; message: ThreadMessage }
  | { kind: "webhook"; notification: ThreadWebhook };

export interface ThreadMessage {
  id: string;
  role: "user" | "assistant";
  createdAt: string;
  username: string;
  textContent?: string;
  images?: { data: string; mimeType: string }[];
  stopReason?: string;
  errorMessage?: string;
  errorRaw?: string;
  toolCalls?: ToolCallSummary[];
  hasErrors?: boolean;
}

export interface ToolCallSummary {
  id: string;
  name: string;
  summaryText: string;
  arguments: Record<string, unknown>;
  result?: { isError: boolean; text: string };
}

export interface MediaRef {
  action: string;
  mediaType: string;
  title: string;
  href: string | null;
  username: string | null;
}

export interface ThreadWebhook {
  id: string;
  source: string;
  receivedAt: string;
  payload: {
    title: string;
    year: number;
    quality?: string;
    releaseGroup?: string;
    episodes?: { seasonNumber: number; episodeNumber: number; title: string }[];
  };
}
