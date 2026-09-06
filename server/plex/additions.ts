import { pmsRequest } from "./server.ts";
import { createLogger } from "../logger.ts";
import { errorMessage } from "../errors.ts";

const log = createLogger("plex-additions");

/** Plex's own type numbers: a movie, and an episode. */
const MOVIE = 1;
const EPISODE = 4;

interface SectionsResponse {
  MediaContainer: { Directory?: { key: string; type: string }[] };
}

export interface Additions {
  movies: number;
  episodes: number;
}

/**
 * Asking for none of the results still reports how many there are, so a count
 * costs one small response per section rather than the whole listing.
 *
 * Plex matches the filter name literally: percent-encoding `>=` makes it ignore
 * the filter and quietly count the whole section.
 */
async function countSince(sectionKey: string, type: number, epoch: number): Promise<number> {
  const response = await pmsRequest<{ MediaContainer: { size?: number } }>(
    `/library/sections/${sectionKey}/all?type=${type}&addedAt>=${epoch}&X-Plex-Container-Size=0`,
  );
  return response.MediaContainer.size ?? 0;
}

/**
 * What became watchable since a point in time. Episodes are counted rather
 * than series, because a season landing is the thing people notice.
 */
export async function getAdditions(since: Date): Promise<Additions> {
  const epoch = Math.floor(since.getTime() / 1000);
  const sections = await pmsRequest<SectionsResponse>("/library/sections");

  const counts = await Promise.all(
    (sections.MediaContainer.Directory ?? []).map(async (section) => {
      if (section.type === "movie") {
        return { movies: await countSince(section.key, MOVIE, epoch), episodes: 0 };
      }
      if (section.type === "show") {
        return { movies: 0, episodes: await countSince(section.key, EPISODE, epoch) };
      }
      return { movies: 0, episodes: 0 };
    }),
  );

  const total = counts.reduce(
    (sum, count) => ({
      movies: sum.movies + count.movies,
      episodes: sum.episodes + count.episodes,
    }),
    { movies: 0, episodes: 0 },
  );

  log.info("counted plex additions", { since: since.toISOString(), ...total });
  return total;
}

/** Undefined rather than a failed page; a missing figure is not worth an error. */
export async function tryGetAdditions(since: Date): Promise<Additions | undefined> {
  try {
    return await getAdditions(since);
  } catch (error) {
    log.error("could not count plex additions", { error: errorMessage(error) });
    return undefined;
  }
}
