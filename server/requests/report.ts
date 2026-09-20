import type { LibraryMediaType } from "#shared/types.ts";
import { getAdminUserIds } from "#server/db/users.ts";
import { saveNotifications } from "#server/db/notifications.ts";
import { getLibraryIndex } from "./library.ts";
import { queueStatusFor, resolveState, type RequestStatus } from "./state.ts";
import { createLogger } from "#server/logger.ts";

const log = createLogger("request-report");

export interface Report {
  mediaType: LibraryMediaType;
  tmdbId: number;
  title: string;
  reportedBy: string;
}

/**
 * What an admin needs in one line: who is stuck, on what, and whatever the
 * service said about it, which is usually the whole answer.
 */
export function reportBody(reportedBy: string, status: RequestStatus): string {
  const detail = status.detail ? ` — ${status.detail}` : "";
  return `${reportedBy} reported a problem. It is ${status.state}${detail}.`;
}

/**
 * Pass a stuck request to whoever can act on it. The state is read here rather
 * than taken from the browser, so the report says what is true now.
 */
export async function reportProblem(report: Report): Promise<{ notified: number }> {
  const library = await getLibraryIndex();
  const entry = library[report.mediaType].get(report.tmdbId);
  const queue = entry ? await queueStatusFor(report.mediaType, entry.serviceId) : undefined;
  const status = resolveState(entry, queue);

  const admins = await getAdminUserIds();
  const notified = await saveNotifications(admins, {
    mediaType: report.mediaType,
    title: report.title,
    body: reportBody(report.reportedBy, status),
    tmdbId: report.tmdbId,
    serviceId: entry?.serviceId,
  });

  log.info("problem reported", {
    mediaType: report.mediaType,
    tmdbId: report.tmdbId,
    state: status.state,
    notified,
  });

  return { notified };
}
