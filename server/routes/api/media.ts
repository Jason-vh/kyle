import { isLibraryMediaType } from "#shared/types.ts";
import { isInteger } from "#server/http/input.ts";
import { requireAuth } from "#server/auth/middleware.ts";
import { getMediaDetail } from "#server/media/detail.ts";
import { getMediaActivity } from "#server/media/activity.ts";
import type { LibraryMediaType } from "#shared/types.ts";
import { ApiError } from "#server/http/client.ts";
import { createLogger } from "#server/logger.ts";
import { errorMessage, errorResponse } from "#server/errors.ts";

const log = createLogger("api-media");

// ---------------------------------------------------------------------------
// GET /api/media/:mediaType/:tmdbId — one title in full
// ---------------------------------------------------------------------------

type Target = { mediaType: LibraryMediaType; tmdbId: number } | { error: Response };

function parseTarget(mediaType: string, rawTmdbId: string): Target {
  if (!isLibraryMediaType(mediaType)) {
    return { error: Response.json({ error: "Unknown media type" }, { status: 404 }) };
  }

  const tmdbId = Number(rawTmdbId);
  if (!isInteger(tmdbId, 1)) {
    return { error: Response.json({ error: "Invalid id" }, { status: 400 }) };
  }

  return { mediaType, tmdbId };
}

export async function handleGetMediaDetail(
  req: Request,
  mediaType: string,
  rawTmdbId: string,
): Promise<Response> {
  const auth = await requireAuth(req);
  if ("error" in auth) return auth.error;

  const target = parseTarget(mediaType, rawTmdbId);
  if ("error" in target) return target.error;

  try {
    const detail = await getMediaDetail(target.mediaType, target.tmdbId, auth.user.id);
    return Response.json(detail);
  } catch (error) {
    // A title TMDB has never heard of is a wrong link, not a broken service.
    if (error instanceof ApiError && error.status === 404) {
      return Response.json({ error: "No such title" }, { status: 404 });
    }

    log.error("could not read the title", { ...target, error: errorMessage(error) });
    return errorResponse(error, 502, "Could not read this title");
  }
}

// ---------------------------------------------------------------------------
// GET /api/media/:mediaType/:tmdbId/activity — what happened to one title
// ---------------------------------------------------------------------------

export async function handleGetMediaActivity(
  req: Request,
  mediaType: string,
  rawTmdbId: string,
): Promise<Response> {
  const auth = await requireAuth(req);
  if ("error" in auth) return auth.error;

  const target = parseTarget(mediaType, rawTmdbId);
  if ("error" in target) return target.error;

  try {
    return Response.json(await getMediaActivity(target.mediaType, target.tmdbId));
  } catch (error) {
    log.error("could not read the activity", { ...target, error: errorMessage(error) });
    return errorResponse(error, 500, "Could not read this title's activity");
  }
}
