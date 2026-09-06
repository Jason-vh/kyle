import { isLibraryMediaType } from "#shared/types.ts";
import { requireAuth } from "#server/auth/middleware.ts";
import { getMediaDetail } from "#server/media/detail.ts";
import { ApiError } from "#server/http/client.ts";
import { createLogger } from "#server/logger.ts";
import { errorMessage, errorResponse } from "#server/errors.ts";

const log = createLogger("api-media");

// ---------------------------------------------------------------------------
// GET /api/media/:mediaType/:tmdbId — one title in full
// ---------------------------------------------------------------------------

export async function handleGetMediaDetail(
  req: Request,
  mediaType: string,
  rawTmdbId: string,
): Promise<Response> {
  const auth = await requireAuth(req);
  if ("error" in auth) return auth.error;

  if (!isLibraryMediaType(mediaType)) {
    return Response.json({ error: "Unknown media type" }, { status: 404 });
  }

  const tmdbId = Number(rawTmdbId);
  if (!Number.isInteger(tmdbId) || tmdbId <= 0) {
    return Response.json({ error: "Invalid id" }, { status: 400 });
  }

  try {
    const detail = await getMediaDetail(mediaType, tmdbId, auth.user.id);
    return Response.json(detail, { headers: auth.refreshHeaders });
  } catch (error) {
    // A title TMDB has never heard of is a wrong link, not a broken service.
    if (error instanceof ApiError && error.status === 404) {
      return Response.json({ error: "No such title" }, { status: 404 });
    }

    log.error("could not read the title", { mediaType, tmdbId, error: errorMessage(error) });
    return errorResponse(error, 502, "Could not read this title");
  }
}
