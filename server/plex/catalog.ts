import { getMachineIdentifier, isPlexServerConfigured, pmsRequest } from "./server.ts";
import { watchKey } from "./keys.ts";
import { createLogger } from "#server/logger.ts";
import { errorMessage } from "#server/errors.ts";

const log = createLogger("plex-catalog");

/**
 * Short, because this is what decides whether a fresh import reads as watchable
 * yet. A rebuild is two listings and about a second, and only ever happens
 * while somebody is looking at a page that needs it.
 */
const CACHE_TTL_MS = 2 * 60 * 1000;

interface SectionsResponse {
  MediaContainer: { Directory?: { key: string; type: string }[] };
}

interface SectionItem {
  ratingKey: string;
  title: string;
  Guid?: { id: string }[];
}

export interface PlexTitle {
  ratingKey: string;
  title: string;
  sectionKey: string;
  mediaType: "movie" | "series";
  /** Absent for anything Plex matched to no TMDB id, which we cannot place. */
  tmdbId?: number;
}

export function tmdbIdOf(item: { Guid?: { id: string }[] }): number | undefined {
  const guid = item.Guid?.find((g) => g.id.startsWith("tmdb://"));
  const id = Number(guid?.id.slice("tmdb://".length));
  return Number.isInteger(id) && id > 0 ? id : undefined;
}

/** Everything the server holds, one listing per movie or show section. */
export async function listPlexTitles(): Promise<PlexTitle[]> {
  const sections = await pmsRequest<SectionsResponse>("/library/sections");
  const titles: PlexTitle[] = [];

  for (const section of sections.MediaContainer.Directory ?? []) {
    const mediaType = plexSectionType(section.type);
    if (!mediaType) continue;

    const listing = await pmsRequest<{ MediaContainer: { Metadata?: SectionItem[] } }>(
      `/library/sections/${section.key}/all?includeGuids=1`,
    );

    for (const item of listing.MediaContainer.Metadata ?? []) {
      titles.push({
        ratingKey: item.ratingKey,
        title: item.title,
        sectionKey: section.key,
        mediaType,
        tmdbId: tmdbIdOf(item),
      });
    }
  }

  return titles;
}

function plexSectionType(type: string): "movie" | "series" | undefined {
  if (type === "movie") return "movie";
  if (type === "show") return "series";
  return undefined;
}

/** The page Plex's own web app opens a title on. */
export function plexWebUrl(machineIdentifier: string, ratingKey: string): string {
  const key = encodeURIComponent(`/library/metadata/${ratingKey}`);
  return `https://app.plex.tv/desktop/#!/server/${machineIdentifier}/details?key=${key}`;
}

/**
 * Where Plex has each title, keyed by media type and TMDB id.
 *
 * Absence from this map means Plex has not scanned the title in *or* could not
 * match it to a TMDB id, so it is only ever evidence that something is not
 * watchable yet — never that it is missing.
 */
export type PlexPlaces = Map<string, string>;

let cached: { value: PlexPlaces; expires: number } | null = null;

async function build(): Promise<PlexPlaces> {
  const [titles, machineIdentifier] = await Promise.all([listPlexTitles(), getMachineIdentifier()]);

  const places: PlexPlaces = new Map();
  for (const title of titles) {
    if (!title.tmdbId) continue;
    places.set(
      watchKey(title.mediaType, title.tmdbId),
      plexWebUrl(machineIdentifier, title.ratingKey),
    );
  }

  log.info("built plex catalog", { titles: titles.length, placed: places.size });
  return places;
}

/**
 * Cached, and `undefined` when Plex cannot be asked at all — which callers
 * must read as "unknown" rather than as an empty library.
 */
export async function getPlexPlaces(): Promise<PlexPlaces | undefined> {
  if (!isPlexServerConfigured()) return undefined;
  if (cached && cached.expires > Date.now()) return cached.value;

  try {
    const value = await build();
    cached = { value, expires: Date.now() + CACHE_TTL_MS };
    return value;
  } catch (error) {
    log.error("could not read the plex catalog", { error: errorMessage(error) });
    return undefined;
  }
}
