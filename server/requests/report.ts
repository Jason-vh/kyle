import type { LibraryMediaType } from "#shared/types.ts";
import { getAdminUserIds } from "#server/db/users.ts";
import { saveNotifications } from "#server/db/notifications.ts";
import { getLibraryIndex } from "./library.ts";
import {
  placeOf,
  queueStatusBySeason,
  queueStatusFor,
  resolveState,
  scopeOf,
  type RequestStatus,
} from "./state.ts";
import { getPlexPlaces } from "#server/plex/catalog.ts";
import type { QueueStatus } from "./queue.ts";
import { createLogger } from "#server/logger.ts";

const log = createLogger("request-report");

export interface Report {
  mediaType: LibraryMediaType;
  tmdbId: number;
  title: string;
  reportedBy: string;
  /** Absent when the whole title was asked for. */
  seasonNumber?: number;
}

/**
 * What an admin needs in one line: who is stuck, on what, and whatever the
 * service said about it, which is usually the whole answer.
 */
export function reportBody(
  reportedBy: string,
  status: RequestStatus,
  seasonNumber?: number,
): string {
  const detail = status.detail ? ` — ${status.detail}` : "";
  const scope = seasonNumber === undefined ? "" : ` with season ${seasonNumber}`;
  return `${reportedBy} reported a problem${scope}. It is ${status.state}${detail}.`;
}

/** The queue of the season that was asked for, or of the whole title. */
async function queueFor(
  mediaType: LibraryMediaType,
  serviceId: number,
  seasonNumber?: number,
): Promise<QueueStatus | undefined> {
  if (seasonNumber === undefined) return queueStatusFor(mediaType, serviceId);
  return (await queueStatusBySeason(serviceId)).get(seasonNumber);
}

/**
 * Pass a stuck request to whoever can act on it. The state is read here rather
 * than taken from the browser, so the report says what is true now.
 */
export async function reportProblem(report: Report): Promise<{ notified: number }> {
  const library = await getLibraryIndex();
  const entry = library[report.mediaType].get(report.tmdbId);
  const queue = entry
    ? await queueFor(report.mediaType, entry.serviceId, report.seasonNumber)
    : undefined;
  const status = resolveState({
    entry: scopeOf(entry, report.seasonNumber),
    queue,
    plex: placeOf(await getPlexPlaces(), report),
  });

  const admins = await getAdminUserIds();
  const notified = await saveNotifications(admins, {
    mediaType: report.mediaType,
    title: report.title,
    body: reportBody(report.reportedBy, status, report.seasonNumber),
    tmdbId: report.tmdbId,
    serviceId: entry?.serviceId,
  });

  log.info("problem reported", {
    mediaType: report.mediaType,
    tmdbId: report.tmdbId,
    seasonNumber: report.seasonNumber,
    state: status.state,
    notified,
  });

  return { notified };
}
