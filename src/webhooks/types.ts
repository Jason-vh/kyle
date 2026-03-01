export interface RadarrWebhookPayload {
  eventType: string;
  movie: {
    id: number;
    title: string;
    year: number;
    tmdbId: number;
    imdbId?: string;
  };
  release?: {
    quality?: string;
    releaseGroup?: string;
  };
}

export interface SonarrWebhookPayload {
  eventType: string;
  series: {
    id: number;
    title: string;
    tvdbId: number;
    year: number;
  };
  episodes: Array<{
    episodeNumber: number;
    seasonNumber: number;
    title: string;
  }>;
  release?: {
    quality?: string;
    releaseGroup?: string;
  };
}

export interface MediaNotificationInfo {
  mediaType: "movie" | "series";
  title: string;
  year: number;
  quality?: string;
  releaseGroup?: string;
  episodes?: Array<{
    seasonNumber: number;
    episodeNumber: number;
    title: string;
  }>;
}

export type MediaRequester =
  | {
      interfaceType: "slack";
      channel: string;
      threadTs: string;
      conversationId: string;
      title: string;
    }
  | {
      interfaceType: "discord";
      channelId: string;
      conversationId: string;
      title: string;
    };
