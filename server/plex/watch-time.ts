import { pmsRequest } from "./server.ts";
import { createLogger } from "#server/logger.ts";
import { errorMessage } from "#server/errors.ts";

const log = createLogger("plex-watch-time");

/** Rating keys per metadata call, so the URL stays a sane length. */
const BATCH_SIZE = 80;

interface HistoryRow {
  ratingKey?: string | null;
  accountID?: number;
}

interface MetadataRow {
  ratingKey: string;
  /** Milliseconds. */
  duration?: number;
}

export interface WatchTime {
  minutes: number;
  /** Rows Plex recorded, whether or not their duration could be resolved. */
  plays: number;
}

async function durationsOf(ratingKeys: string[]): Promise<Map<string, number>> {
  const durations = new Map<string, number>();

  for (let i = 0; i < ratingKeys.length; i += BATCH_SIZE) {
    const batch = ratingKeys.slice(i, i + BATCH_SIZE);
    const response = await pmsRequest<{ MediaContainer: { Metadata?: MetadataRow[] } }>(
      `/library/metadata/${batch.join(",")}`,
    );
    for (const item of response.MediaContainer.Metadata ?? []) {
      if (item.duration) durations.set(item.ratingKey, item.duration);
    }
  }

  return durations;
}

/**
 * How long the server played things since a point in time.
 *
 * Plex writes a history row once something counts as watched but records no
 * duration on it, so the item's own runtime stands in. Something abandoned
 * before the watched threshold contributes nothing, and something watched
 * twice counts twice — which is what the row means.
 *
 * A deleted item can no longer say how long it was, so it is left out rather
 * than guessed at.
 */
export async function getWatchTime(since: Date): Promise<WatchTime> {
  const epoch = Math.floor(since.getTime() / 1000);
  // Plex matches the filter name literally: percent-encoding `>=` makes it
  // ignore the filter and quietly return the entire history.
  const history = await pmsRequest<{ MediaContainer: { Metadata?: HistoryRow[] } }>(
    `/status/sessions/history/all?viewedAt>=${epoch}`,
  );

  const rows = history.MediaContainer.Metadata ?? [];
  const ratingKeys = rows.map((row) => row.ratingKey).filter((key) => key != null);
  const durations = await durationsOf([...new Set(ratingKeys)]);

  const totalMs = ratingKeys.reduce((sum, key) => sum + (durations.get(key) ?? 0), 0);

  log.info("measured plex watch time", {
    since: since.toISOString(),
    plays: rows.length,
    resolved: ratingKeys.filter((key) => durations.has(key)).length,
  });

  return { minutes: Math.round(totalMs / 60_000), plays: rows.length };
}

/** Zero rather than a failed page; a missing figure is not worth an error. */
export async function tryGetWatchTime(since: Date): Promise<WatchTime | undefined> {
  try {
    return await getWatchTime(since);
  } catch (error) {
    log.error("could not read plex watch time", { error: errorMessage(error) });
    return undefined;
  }
}
