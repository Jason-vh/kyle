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

/** How much of an item is actually on disk. */
export type LibraryAvailability = "available" | "partial" | "missing";

export interface LibraryItem {
  mediaType: LibraryMediaType;
  /** Radarr or Sonarr id, and what management acts on. */
  serviceId: number;
  tmdbId?: number;
  title: string;
  year?: number;
  posterUrl?: string;
  monitored: boolean;
  sizeOnDisk: number;
  availability: LibraryAvailability;
  /** Episode progress for a series, e.g. "12/90 episodes". */
  detail?: string;
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
