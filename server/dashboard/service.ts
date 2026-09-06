import type { DashboardResponse } from "../../shared/types.ts";
import { getMediaRequestsForUser } from "../db/requests.ts";
import { withState } from "../requests/state.ts";
import { tryGetAdditions } from "../plex/additions.ts";
import { tryGetWatchTime } from "../plex/watch-time.ts";
import { getActivity } from "./activity.ts";
import { getStorage } from "./storage.ts";
import { createLogger } from "../logger.ts";
import { errorMessage } from "../errors.ts";

const log = createLogger("dashboard");

/** "The last week" everywhere on the page, so the figures agree with each other. */
const WINDOW_DAYS = 7;

/** Enough of the feed to scroll on a phone without it becoming a second library. */
const ACTIVITY_LIMIT = 20;

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
  const since = new Date(Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000);

  const [watch, additions, storage, [activity, activityDown], [requests, requestsDown]] =
    await Promise.all([
      tryGetWatchTime(since),
      tryGetAdditions(since),
      getStorage(),
      tolerate("Activity", [], () => getActivity(viewerId, since)),
      tolerate("Requests", [], async () => withState(await getMediaRequestsForUser(viewerId))),
    ]);

  return {
    windowDays: WINDOW_DAYS,
    stats: {
      watchMinutes: watch?.minutes,
      newMovies: additions?.movies,
      newEpisodes: additions?.episodes,
      storage,
    },
    activity: activity.slice(0, ACTIVITY_LIMIT),
    requests,
    unavailable: [activityDown, requestsDown].filter((name) => name !== undefined),
  };
}
