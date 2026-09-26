import type {
  LibraryMediaType,
  MediaActivity,
  MediaActivityKind,
  MediaActivityResponse,
  Person,
} from "#shared/types.ts";
import { episodesLabel, seasonName, type EpisodeRef } from "#shared/media.ts";
import * as radarr from "#server/radarr/api.ts";
import * as sonarr from "#server/sonarr/api.ts";
import { getRequestersForMedia } from "#server/db/requests.ts";
import { getRemoval } from "#server/db/removals.ts";
import { getLibraryIndex } from "#server/requests/library.ts";
import { getPlexAvatars } from "#server/plex/access.ts";
import { getPlays, watchKey } from "#server/plex/history.ts";
import { serviceName } from "./detail.ts";
import { createLogger } from "#server/logger.ts";
import { errorMessage } from "#server/errors.ts";

const log = createLogger("media-activity");

/** Longer than a binge, shorter than the gap between two evenings. */
const SITTING_MS = 6 * 60 * 60 * 1000;

type RepeatedKind = Extract<MediaActivityKind, "grabbed" | "imported" | "watched">;

/** The history events worth telling; renames, deletions and failures are noise here. */
const SERVICE_EVENTS = new Map<string, RepeatedKind>([
  ["grabbed", "grabbed"],
  ["downloadFolderImported", "imported"],
]);

/** Something that happens once per file or per play, and reads better folded with its neighbours. */
export interface Occurrence {
  kind: RepeatedKind;
  at: string;
  person?: Person;
  episode?: EpisodeRef;
  quality?: string;
}

function groupKey(occurrence: Occurrence): string {
  return [occurrence.kind, occurrence.person?.name, occurrence.episode?.seasonNumber].join("|");
}

/** Each episode once, however often it was grabbed, upgraded or rewatched. */
function uniqueEpisodes(group: Occurrence[]): EpisodeRef[] {
  const episodes = new Map<string, EpisodeRef>();
  for (const { episode } of group) {
    if (!episode) continue;
    const key = `${episode.seasonNumber}:${episode.episodeNumber}`;
    if (!episodes.get(key)?.title) episodes.set(key, episode);
  }
  return [...episodes.values()].sort((a, b) => a.episodeNumber - b.episodeNumber);
}

function toActivity(group: [Occurrence, ...Occurrence[]]): MediaActivity {
  const [first] = group;
  const latest = group[group.length - 1] ?? first;
  const episodes = uniqueEpisodes(group);

  const parts = [episodes.length > 0 ? episodesLabel(episodes) : undefined, latest.quality];
  const detail = parts.filter((part) => part !== undefined).join(" · ");

  return {
    id: `${groupKey(first)}|${first.at}`,
    kind: first.kind,
    at: latest.at,
    person: first.person,
    detail: detail || undefined,
  };
}

/**
 * One line per sitting rather than per file or per play: the same kind of
 * thing, by the same person, to the same season, with no long pause between.
 */
export function groupOccurrences(occurrences: Occurrence[]): MediaActivity[] {
  const chronological = [...occurrences].sort((a, b) => a.at.localeCompare(b.at));
  const open = new Map<string, [Occurrence, ...Occurrence[]]>();
  const groups: [Occurrence, ...Occurrence[]][] = [];

  for (const occurrence of chronological) {
    const key = groupKey(occurrence);
    const group = open.get(key);
    const last = group?.[group.length - 1];

    if (group && last && Date.parse(occurrence.at) - Date.parse(last.at) <= SITTING_MS) {
      group.push(occurrence);
      continue;
    }

    const fresh: [Occurrence, ...Occurrence[]] = [occurrence];
    open.set(key, fresh);
    groups.push(fresh);
  }

  return groups.map(toActivity);
}

async function movieOccurrences(movieId: number): Promise<Occurrence[]> {
  const occurrences: Occurrence[] = [];
  for (const record of await radarr.getMovieHistory(movieId)) {
    const kind = SERVICE_EVENTS.get(record.eventType);
    if (!kind) continue;
    occurrences.push({ kind, at: record.date, quality: record.quality.quality.name });
  }
  return occurrences;
}

/** Sonarr's series history ignores `includeEpisode`, so episodes are looked up by id. */
async function seriesOccurrences(seriesId: number): Promise<Occurrence[]> {
  const [history, episodes] = await Promise.all([
    sonarr.getSeriesHistory(seriesId, false, false),
    sonarr.getEpisodes(seriesId),
  ]);
  const byId = new Map(episodes.map((episode) => [episode.id, episode]));

  const occurrences: Occurrence[] = [];
  for (const record of history) {
    const kind = SERVICE_EVENTS.get(record.eventType);
    if (!kind) continue;

    const known = byId.get(record.episodeId);
    const episode = known && {
      seasonNumber: known.seasonNumber,
      episodeNumber: known.episodeNumber,
      title: known.title,
    };
    occurrences.push({ kind, at: record.date, episode, quality: record.quality.quality.name });
  }
  return occurrences;
}

/**
 * What Radarr or Sonarr did with the title. They forget a title they no longer
 * hold, so a removed one has no history left to tell.
 */
async function serviceOccurrences(
  mediaType: LibraryMediaType,
  tmdbId: number,
): Promise<Occurrence[] | undefined> {
  try {
    const library = await getLibraryIndex();
    if (library.unavailable.includes(mediaType)) return undefined;

    const entry = library[mediaType].get(tmdbId);
    if (!entry) return [];

    if (mediaType === "movie") return await movieOccurrences(entry.serviceId);
    return await seriesOccurrences(entry.serviceId);
  } catch (error) {
    log.warn("service history unavailable", {
      source: serviceName(mediaType),
      tmdbId,
      error: errorMessage(error),
    });
    return undefined;
  }
}

async function requestActivity(
  mediaType: LibraryMediaType,
  tmdbId: number,
): Promise<MediaActivity[]> {
  const [requesters, avatars] = await Promise.all([
    getRequestersForMedia(mediaType, tmdbId),
    getPlexAvatars(),
  ]);

  return requesters.map((requester) => {
    const thumb = requester.plexAccountId ? avatars.get(requester.plexAccountId) : undefined;
    const season = requester.seasonNumber;
    return {
      id: `requested|${requester.userId}|${season ?? "series"}`,
      kind: "requested",
      at: requester.createdAt.toISOString(),
      person: { name: requester.name, thumb },
      detail: season === null ? undefined : seasonName(season),
    };
  });
}

async function removalActivity(
  mediaType: LibraryMediaType,
  tmdbId: number,
): Promise<MediaActivity[]> {
  const removal = await getRemoval(mediaType, tmdbId);
  if (!removal) return [];

  return [
    {
      id: "removed",
      kind: "removed",
      at: removal.at.toISOString(),
      person: removal.removedBy ? { name: removal.removedBy } : undefined,
    },
  ];
}

/**
 * Everything that happened to one title, newest first: who asked for it, when
 * it was fetched, who watched it, and who took it out. A service being down
 * costs only its own lines.
 */
export async function getMediaActivity(
  mediaType: LibraryMediaType,
  tmdbId: number,
): Promise<MediaActivityResponse> {
  const [requests, removals, service, plays] = await Promise.all([
    requestActivity(mediaType, tmdbId),
    removalActivity(mediaType, tmdbId),
    serviceOccurrences(mediaType, tmdbId),
    getPlays(watchKey(mediaType, tmdbId)),
  ]);

  const watched = plays.map(
    (play): Occurrence => ({
      kind: "watched",
      at: play.at,
      person: play.person,
      episode: play.episode,
    }),
  );

  const events = [
    ...requests,
    ...removals,
    ...groupOccurrences([...(service ?? []), ...watched]),
  ].sort((a, b) => b.at.localeCompare(a.at));

  return { events, unavailable: service ? [] : [serviceName(mediaType)] };
}
