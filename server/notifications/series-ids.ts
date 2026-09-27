import { and, eq, isNotNull, isNull } from "drizzle-orm";
import { db } from "#server/db/index.ts";
import { notifications } from "#server/db/schema.ts";
import { getLibraryIndex } from "#server/requests/library.ts";
import { createLogger } from "#server/logger.ts";
import { errorMessage } from "#server/errors.ts";

const log = createLogger("notification-series-ids");

export async function fillSeriesIds(userId: string): Promise<void> {
  const unmatched = and(
    eq(notifications.userId, userId),
    eq(notifications.mediaType, "series"),
    isNull(notifications.tmdbId),
    isNotNull(notifications.serviceId),
  );
  const rows = await db
    .selectDistinct({ serviceId: notifications.serviceId })
    .from(notifications)
    .where(unmatched);
  if (rows.length === 0) return;

  try {
    const { series } = await getLibraryIndex();
    const tmdbByService = new Map(
      [...series].map(([tmdbId, entry]) => [entry.serviceId, tmdbId] as const),
    );

    for (const { serviceId } of rows) {
      const tmdbId = serviceId === null ? undefined : tmdbByService.get(serviceId);
      if (!tmdbId || serviceId === null) continue;
      await db
        .update(notifications)
        .set({ tmdbId })
        .where(and(unmatched, eq(notifications.serviceId, serviceId)));
    }
  } catch (error) {
    log.warn("could not match series notifications to tmdb", { error: errorMessage(error) });
  }
}
