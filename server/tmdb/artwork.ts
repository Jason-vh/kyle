import type { LibraryMediaType } from "#shared/types.ts";
import { db } from "#server/db/index.ts";
import { tmdbArtwork } from "#server/db/schema.ts";
import { ApiError } from "#server/http/client.ts";
import * as radarr from "#server/radarr/api.ts";
import * as sonarr from "#server/sonarr/api.ts";
import { createLogger } from "#server/logger.ts";
import { errorMessage } from "#server/errors.ts";
import { getArtwork } from "./api.ts";

const log = createLogger("tmdb-artwork");

const IMAGE_BASE = "https://image.tmdb.org/t/p";
const STALE_MS = 30 * 24 * 60 * 60 * 1000;
const BATCH = 4;
const WAITED_FOR = 40;

export interface TitleRef {
  mediaType: LibraryMediaType;
  tmdbId: number;
}

type Row = typeof tmdbArtwork.$inferSelect;

export function artworkKey(mediaType: string, tmdbId: number): string {
  return `${mediaType}:${tmdbId}`;
}

export function posterUrl(posterPath: string): string {
  return `${IMAGE_BASE}/w342${posterPath}`;
}

const inFlight = new Map<string, Promise<void>>();

async function fetchOne(ref: TitleRef): Promise<void> {
  const kind = ref.mediaType === "movie" ? "movie" : "tv";
  let posterPath: string | null = null;
  let backdropPath: string | null = null;

  try {
    const artwork = await getArtwork(kind, ref.tmdbId);
    posterPath = artwork.poster_path;
    backdropPath = artwork.backdrop_path;
  } catch (error) {
    if (!(error instanceof ApiError && error.status === 404)) {
      log.warn("artwork unavailable", { ...ref, error: errorMessage(error) });
      return;
    }
  }

  const row = { ...ref, posterPath, backdropPath, fetchedAt: new Date() };
  await db
    .insert(tmdbArtwork)
    .values(row)
    .onConflictDoUpdate({
      target: [tmdbArtwork.mediaType, tmdbArtwork.tmdbId],
      set: { posterPath, backdropPath, fetchedAt: row.fetchedAt },
    });
}

function refresh(ref: TitleRef): Promise<void> {
  const key = artworkKey(ref.mediaType, ref.tmdbId);
  const running = inFlight.get(key);
  if (running) return running;

  const task = fetchOne(ref).finally(() => inFlight.delete(key));
  inFlight.set(key, task);
  return task;
}

async function refreshAll(refs: TitleRef[]): Promise<void> {
  for (let index = 0; index < refs.length; index += BATCH) {
    await Promise.all(refs.slice(index, index + BATCH).map(refresh));
  }
}

async function cachedRows(): Promise<Map<string, Row>> {
  const rows = await db.select().from(tmdbArtwork);
  return new Map(rows.map((row) => [artworkKey(row.mediaType, row.tmdbId), row]));
}

function unique(refs: TitleRef[]): TitleRef[] {
  const seen = new Map<string, TitleRef>();
  for (const ref of refs) seen.set(artworkKey(ref.mediaType, ref.tmdbId), ref);
  return [...seen.values()];
}

export async function getPosters(refs: TitleRef[]): Promise<Map<string, string>> {
  const wanted = unique(refs);
  let rows = await cachedRows();

  const missing = wanted.filter((ref) => !rows.has(artworkKey(ref.mediaType, ref.tmdbId)));
  const stale = wanted.filter((ref) => {
    const row = rows.get(artworkKey(ref.mediaType, ref.tmdbId));
    return row !== undefined && Date.now() - row.fetchedAt.getTime() > STALE_MS;
  });

  const awaited = missing.slice(0, WAITED_FOR);
  const later = [...missing.slice(WAITED_FOR), ...stale];

  if (awaited.length > 0) {
    await refreshAll(awaited);
    rows = await cachedRows();
  }
  if (later.length > 0) void refreshAll(later);

  const posters = new Map<string, string>();
  for (const ref of wanted) {
    const path = rows.get(artworkKey(ref.mediaType, ref.tmdbId))?.posterPath;
    if (path) posters.set(artworkKey(ref.mediaType, ref.tmdbId), posterUrl(path));
  }
  return posters;
}

export async function attachPosters<
  T extends { mediaType: LibraryMediaType; tmdbId?: number; posterUrl?: string },
>(items: T[]): Promise<T[]> {
  const refs = items.flatMap((item) =>
    item.tmdbId ? [{ mediaType: item.mediaType, tmdbId: item.tmdbId }] : [],
  );
  if (refs.length === 0) return items;

  let posters: Map<string, string>;
  try {
    posters = await getPosters(refs);
  } catch (error) {
    log.warn("posters unavailable", { error: errorMessage(error) });
    return items;
  }

  for (const item of items) {
    if (!item.tmdbId) continue;
    const poster = posters.get(artworkKey(item.mediaType, item.tmdbId));
    if (poster) item.posterUrl = poster;
  }
  return items;
}

async function libraryRefs(): Promise<TitleRef[]> {
  const [movies, series] = await Promise.all([
    radarr.getMovies().catch(() => []),
    sonarr.getAllSeries().catch(() => []),
  ]);
  return [
    ...movies.map((movie) => ({ mediaType: "movie" as const, tmdbId: movie.tmdbId })),
    ...series
      .filter((show) => show.tmdbId)
      .map((show) => ({ mediaType: "series" as const, tmdbId: show.tmdbId! })),
  ];
}

export async function warmArtwork(): Promise<void> {
  const refs = unique(await libraryRefs());
  const rows = await cachedRows();
  const due = refs.filter((ref) => {
    const row = rows.get(artworkKey(ref.mediaType, ref.tmdbId));
    return !row || Date.now() - row.fetchedAt.getTime() > STALE_MS;
  });
  await refreshAll(due);
  log.info("artwork warmed", { titles: refs.length, fetched: due.length });
}
