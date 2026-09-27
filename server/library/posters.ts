import * as radarr from "#server/radarr/api.ts";
import * as sonarr from "#server/sonarr/api.ts";
import { posterOf } from "#server/media-images.ts";
import { watchKey } from "#server/plex/keys.ts";
import { createLogger } from "#server/logger.ts";
import { errorMessage } from "#server/errors.ts";

const log = createLogger("posters");

const CACHE_TTL_MS = 10 * 60 * 1000;

let cached: { value: Map<string, string>; expires: number } | null = null;

async function tryList<T>(name: string, load: () => Promise<T[]>): Promise<T[]> {
  try {
    return await load();
  } catch (error) {
    log.warn("posters unavailable", { source: name, error: errorMessage(error) });
    return [];
  }
}

async function build(): Promise<Map<string, string>> {
  const [movies, series] = await Promise.all([
    tryList("Radarr", radarr.getMovies),
    tryList("Sonarr", sonarr.getAllSeries),
  ]);

  const posters = new Map<string, string>();
  for (const movie of movies) {
    const poster = posterOf(movie);
    if (poster) posters.set(watchKey("movie", movie.tmdbId), poster);
  }
  for (const show of series) {
    const poster = posterOf(show);
    if (poster && show.tmdbId) posters.set(watchKey("series", show.tmdbId), poster);
  }
  return posters;
}

export async function getPosters(): Promise<Map<string, string>> {
  if (cached && cached.expires > Date.now()) return cached.value;
  const value = await build();
  cached = { value, expires: Date.now() + CACHE_TTL_MS };
  return value;
}

export function invalidatePosters(): void {
  cached = null;
}
