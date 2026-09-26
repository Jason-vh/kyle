import { and, eq } from "drizzle-orm";
import type { LibraryMediaType } from "#shared/types.ts";
import { db } from "./index.ts";
import { mediaRemovals } from "./schema.ts";
import { createLogger } from "#server/logger.ts";
import { errorMessage } from "#server/errors.ts";

const log = createLogger("db-removals");

export interface NewRemoval {
  mediaType: LibraryMediaType;
  tmdbId: number;
  title: string;
  /** Absent when something other than Kyle took it out. */
  removedBy?: string;
  deletedFiles: boolean;
}

export interface Removal {
  removedBy: string | null;
  deletedFiles: boolean;
  at: Date;
}

/**
 * Remember why a title left. Non-fatal: a removal that happened must not be
 * undone by a bookkeeping failure.
 */
export async function recordRemoval(input: NewRemoval): Promise<void> {
  try {
    await db
      .insert(mediaRemovals)
      .values({ ...input, removedBy: input.removedBy ?? null })
      .onConflictDoUpdate({
        target: [mediaRemovals.mediaType, mediaRemovals.tmdbId],
        set: {
          title: input.title,
          removedBy: input.removedBy ?? null,
          deletedFiles: input.deletedFiles,
          createdAt: new Date(),
        },
      });
  } catch (error) {
    log.error("could not record a removal", { ...input, error: errorMessage(error) });
  }
}

function key(mediaType: string, tmdbId: number): string {
  return `${mediaType}:${tmdbId}`;
}

/** Every removal, keyed by media type and TMDB id; a household's list is small. */
export async function getRemovals(): Promise<Map<string, Removal>> {
  const rows = await db
    .select({
      mediaType: mediaRemovals.mediaType,
      tmdbId: mediaRemovals.tmdbId,
      removedBy: mediaRemovals.removedBy,
      deletedFiles: mediaRemovals.deletedFiles,
      createdAt: mediaRemovals.createdAt,
    })
    .from(mediaRemovals);

  return new Map(
    rows.map((row) => [
      key(row.mediaType, row.tmdbId),
      { removedBy: row.removedBy, deletedFiles: row.deletedFiles, at: row.createdAt },
    ]),
  );
}

/** Why one title left, if it has. */
export async function getRemoval(
  mediaType: LibraryMediaType,
  tmdbId: number,
): Promise<Removal | undefined> {
  const [row] = await db
    .select({
      removedBy: mediaRemovals.removedBy,
      deletedFiles: mediaRemovals.deletedFiles,
      at: mediaRemovals.createdAt,
    })
    .from(mediaRemovals)
    .where(and(eq(mediaRemovals.mediaType, mediaType), eq(mediaRemovals.tmdbId, tmdbId)));

  return row;
}

/** Forgets a removal, for a title that has been asked for again. */
export async function clearRemoval(mediaType: LibraryMediaType, tmdbId: number): Promise<void> {
  try {
    await db
      .delete(mediaRemovals)
      .where(and(eq(mediaRemovals.mediaType, mediaType), eq(mediaRemovals.tmdbId, tmdbId)));
  } catch (error) {
    log.error("could not clear a removal", { mediaType, tmdbId, error: errorMessage(error) });
  }
}
