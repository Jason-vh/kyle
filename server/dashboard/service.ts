import type { DashboardResponse, MediaRequest } from "#shared/types.ts";
import { getMediaRequestsForUser } from "#server/db/requests.ts";
import { withState } from "#server/requests/state.ts";
import { tryGetAdditions, type Additions } from "#server/plex/additions.ts";
import { tryGetWatchTime, type WatchTime } from "#server/plex/watch-time.ts";
import { getActivity } from "./activity.ts";
import { getRequestedBytes, getStorage } from "./storage.ts";
import { createLogger } from "#server/logger.ts";
import { errorMessage } from "#server/errors.ts";

const log = createLogger("dashboard");

/** "The last week" everywhere on the page, so the figures agree with each other. */
const WINDOW_DAYS = 7;

const WINDOW_STEP_MS = 5 * 60 * 1000;

/** Enough of the feed to scroll on a phone without it becoming a second library. */
const ACTIVITY_LIMIT = 20;

/**
 * A title that has left the library is no longer on its way, and the section is
 * about what is coming. It stays on the requests page, where the history of it
 * is the point.
 */
export function stillComing(requests: MediaRequest[]): MediaRequest[] {
  return requests.filter((request) => request.state !== "removed");
}

export function windowStart(now: number): Date {
  const start = now - WINDOW_DAYS * 24 * 60 * 60 * 1000;
  return new Date(start - (start % WINDOW_STEP_MS));
}

interface PlexFigures {
  watch?: WatchTime;
  additions?: Additions;
}

let plexFigures: { since: number; value: PlexFigures } | null = null;

async function getPlexFigures(since: Date): Promise<PlexFigures> {
  if (plexFigures?.since === since.getTime()) return plexFigures.value;

  const [watch, additions] = await Promise.all([tryGetWatchTime(since), tryGetAdditions(since)]);
  const value = { watch, additions };
  if (watch && additions) plexFigures = { since: since.getTime(), value };
  return value;
}

/** Resolves to a fallback rather than failing, naming the source if it did. */
async function tolerate<T>(
  name: string,
  fallback: T,
  load: () => Promise<T>,
): Promise<[T, string?]> {
  try {
    return [await load()];
  } catch (error) {
    log.error("dashboard source unavailable", { source: name, error: errorMessage(error) });
    return [fallback, name];
  }
}

/**
 * Everything the home screen shows. Each source is allowed to fail on its own:
 * a page missing one figure beats a page that will not load.
 */
export async function getDashboard(viewerId: string): Promise<DashboardResponse> {
  const since = windowStart(Date.now());

  const [
    { watch, additions },
    [storage, storageDown],
    [requestedBytes, requestedDown],
    [activity, activityDown],
    [requests, requestsDown],
  ] = await Promise.all([
    getPlexFigures(since),
    tolerate("Ultra", undefined, getStorage),
    tolerate("Radarr and Sonarr", undefined, getRequestedBytes),
    tolerate("Activity", [], () => getActivity(viewerId, since)),
    tolerate("Requests", [], async () =>
      stillComing(await withState(await getMediaRequestsForUser(viewerId))),
    ),
  ]);

  return {
    windowDays: WINDOW_DAYS,
    stats: {
      watchMinutes: watch?.minutes,
      newMovies: additions?.movies,
      newEpisodes: additions?.episodes,
      storage: storage && { ...storage, requestedBytes },
    },
    activity: activity.slice(0, ACTIVITY_LIMIT),
    requests,
    unavailable: [storageDown, requestedDown, activityDown, requestsDown].filter(
      (name) => name !== undefined,
    ),
  };
}
