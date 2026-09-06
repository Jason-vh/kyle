/** Radarr and Sonarr both attach artwork the same way. */
export interface ImageBearing {
  images?: { coverType?: string; remoteUrl?: string }[];
}

export function posterOf(item: ImageBearing | undefined): string | undefined {
  return item?.images?.find((image) => image.coverType === "poster")?.remoteUrl;
}
