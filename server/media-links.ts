import { optionalEnv } from "./config.ts";

/** Deep link to a media item in Radarr or Sonarr, when that host is configured. */
export function mediaHref(mediaType: string, ids: Record<string, unknown>): string | null {
  const titleSlug = ids.titleSlug;
  if (!titleSlug) return null;

  if (mediaType === "movie") {
    const host = optionalEnv("RADARR_HOST");
    return host ? `${host}/movie/${titleSlug}` : null;
  }
  if (mediaType === "series") {
    const host = optionalEnv("SONARR_HOST");
    return host ? `${host}/series/${titleSlug}` : null;
  }
  return null;
}
