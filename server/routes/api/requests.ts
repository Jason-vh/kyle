import { requireAuth } from "#server/auth/middleware.ts";
import { searchRequestableMedia } from "#server/requests/search.ts";
import {
  MediaNotFoundError,
  requestMovie,
  requestSeries,
  type RequestableMediaType,
  type Requester,
} from "#server/requests/service.ts";
import { getAllMediaRequests, getMediaRequestsForUser } from "#server/db/requests.ts";
import { withState } from "#server/requests/state.ts";
import { createLogger } from "#server/logger.ts";
import { errorMessage, errorResponse } from "#server/errors.ts";

const log = createLogger("api-requests");

// ---------------------------------------------------------------------------
// GET /api/discover?q= — search for something to request
// ---------------------------------------------------------------------------

export async function handleDiscoverSearch(req: Request): Promise<Response> {
  const auth = await requireAuth(req);
  if ("error" in auth) return auth.error;

  const query = new URL(req.url).searchParams.get("q")?.trim();
  if (!query) return Response.json({ results: [] });

  try {
    return Response.json({ results: await searchRequestableMedia(query) });
  } catch (error) {
    log.error("discover search failed", { query, error: errorMessage(error) });
    return errorResponse(error, 502, "Search failed");
  }
}

// ---------------------------------------------------------------------------
// POST /api/requests — request a title
// ---------------------------------------------------------------------------

interface RequestBody {
  mediaType?: string;
  tmdbId?: number;
  posterPath?: string;
}

function isRequestableType(value: unknown): value is RequestableMediaType {
  return value === "movie" || value === "series";
}

/** What the browser needs to know about a request it just made. */
async function addForUser(
  mediaType: RequestableMediaType,
  tmdbId: number,
  requestedBy: Requester,
  posterPath?: string,
) {
  if (mediaType === "movie") {
    const { status, movie } = await requestMovie({ tmdbId, requestedBy, posterPath });
    return { status, title: movie.title, year: movie.year || undefined };
  }

  const { status, series } = await requestSeries({ tmdbId, requestedBy, posterPath });
  return { status, title: series.title, year: series.year || undefined };
}

export async function handleCreateRequest(req: Request): Promise<Response> {
  const auth = await requireAuth(req);
  if ("error" in auth) return auth.error;

  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!isRequestableType(body.mediaType)) {
    return Response.json({ error: "mediaType must be 'movie' or 'series'" }, { status: 400 });
  }
  if (typeof body.tmdbId !== "number" || !Number.isInteger(body.tmdbId)) {
    return Response.json({ error: "tmdbId must be an integer" }, { status: 400 });
  }

  try {
    const outcome = await addForUser(
      body.mediaType,
      body.tmdbId,
      { userId: auth.user.id },
      body.posterPath,
    );
    return Response.json(outcome, { headers: auth.refreshHeaders });
  } catch (error) {
    if (error instanceof MediaNotFoundError) {
      return Response.json({ error: error.message }, { status: 404 });
    }
    log.error("request failed", {
      userId: auth.user.id,
      mediaType: body.mediaType,
      tmdbId: body.tmdbId,
      error: errorMessage(error),
    });
    return errorResponse(error, 502, "Could not add this to the library");
  }
}

// ---------------------------------------------------------------------------
// GET /api/requests — your requests, or everyone's for an admin
// ---------------------------------------------------------------------------

export async function handleGetRequests(req: Request): Promise<Response> {
  const auth = await requireAuth(req);
  if ("error" in auth) return auth.error;

  const all = new URL(req.url).searchParams.get("all") === "true" && auth.user.admin;
  const rows = all ? await getAllMediaRequests() : await getMediaRequestsForUser(auth.user.id);

  return Response.json({ requests: await withState(rows) }, { headers: auth.refreshHeaders });
}
