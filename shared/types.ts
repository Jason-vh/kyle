// Auth
export interface AuthStatusResponse {
  authenticated: boolean;
  user?: {
    id: string;
    name: string;
    admin: boolean;
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
}

export interface LibraryItem extends LibraryState {
  mediaType: LibraryMediaType;
  tmdbId?: number;
  title: string;
  year?: number;
  posterUrl?: string;
  /** Names of anyone who requested it through Kyle; empty for older media. */
  requestedBy: string[];
  requestedByMe: boolean;
  /** Anyone who has played it on the Plex server. */
  watchedBy: Watcher[];
}

export interface Watcher {
  name: string;
  thumb?: string;
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
  /** TMDB's own wording: "Released", "Returning Series", … */
  status?: string;
  /** Absent when neither Radarr nor Sonarr holds it. */
  library?: LibraryState;
  /** 0–1, while downloading. */
  progress?: number;
  /** What the download client thinks is left, e.g. "00:12:31". */
  eta?: string;
  requestedBy: string[];
  requestedByMe: boolean;
  watchedBy: Watcher[];
  /** Services that could not be reached, so part of this is missing. */
  unavailable: string[];
}

// Requests

/** Where a request has got to, worked out live rather than stored. */
export type RequestState = "available" | "downloading" | "pending" | "unavailable";

export interface MediaRequest {
  id: string;
  mediaType: LibraryMediaType;
  tmdbId: number;
  title: string;
  year: number | null;
  posterPath: string | null;
  /** Only present when looking at everyone's requests. */
  requestedBy?: string;
  createdAt: string;
  state: RequestState;
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
  /** "S01E04 · Good News" for an episode. */
  detail?: string;
  posterUrl?: string;
  at: string;
  requestedBy: string[];
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
  shareUrl: string | null;
  mediaRefs: { action: string; title: string }[];
}

// Thread detail
export interface ThreadDetail {
  id: string;
  interfaceType: string;
  pageTitle: string;
  createdAt: string;
  shareUrl: string | null;
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
