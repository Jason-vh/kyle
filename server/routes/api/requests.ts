import { requireAuth } from "#server/auth/middleware.ts";
import { searchRequestableMedia } from "#server/requests/search.ts";
import {
  MediaNotFoundError,
  requestEpisode,
  requestMovie,
  requestSeason,
  requestSeries,
  type RequestableMediaType,
  type Requester,
} from "#server/requests/service.ts";
import { getAllMediaRequests, getMediaRequestsForUser } from "#server/db/requests.ts";
import { getLibraryIndex } from "#server/requests/library.ts";
import { reportProblem } from "#server/requests/report.ts";
import { retryRequest } from "#server/requests/retry.ts";
import { withState } from "#server/requests/state.ts";
import { isLibraryMediaType } from "#shared/types.ts";
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
  /** A series only: which season is wanted, and which episode of it. */
  seasonNumber?: number;
  episodeNumber?: number;
}

function isRequestableType(value: unknown): value is RequestableMediaType {
  return value === "movie" || value === "series";
}

interface Scope {
  seasonNumber?: number;
  episodeNumber?: number;
}

/** What the browser needs to know about a request it just made. */
async function addForUser(
  mediaType: RequestableMediaType,
  tmdbId: number,
  requestedBy: Requester,
  posterPath: string | undefined,
  scope: Scope,
) {
  if (mediaType === "movie") {
    const { status, movie } = await requestMovie({ tmdbId, requestedBy, posterPath });
    return { status, title: movie.title, year: movie.year || undefined };
  }

  const common = { tmdbId, requestedBy, posterPath };
  const { seasonNumber, episodeNumber } = scope;

  if (seasonNumber !== undefined && episodeNumber !== undefined) {
    const { status, series } = await requestEpisode({ ...common, seasonNumber, episodeNumber });
    return { status, title: series.title, year: series.year || undefined, seasonNumber };
  }

  if (seasonNumber !== undefined) {
    const { status, series } = await requestSeason({ ...common, seasonNumber });
    return { status, title: series.title, year: series.year || undefined, seasonNumber };
  }

  const { status, series } = await requestSeries(common);
  return { status, title: series.title, year: series.year || undefined };
}

/** A season is 0 or more (0 is Sonarr's specials); an episode is 1 or more. */
function scopeError(body: RequestBody): string | undefined {
  const { mediaType, seasonNumber, episodeNumber } = body;

  if (seasonNumber === undefined && episodeNumber === undefined) return undefined;
  if (mediaType !== "series") return "Only a series has seasons";
  if (seasonNumber !== undefined && (!Number.isInteger(seasonNumber) || seasonNumber < 0)) {
    return "seasonNumber must be a non-negative integer";
  }
  if (episodeNumber === undefined) return undefined;
  if (seasonNumber === undefined) return "episodeNumber needs a seasonNumber";
  if (!Number.isInteger(episodeNumber) || episodeNumber < 1) {
    return "episodeNumber must be a positive integer";
  }
  return undefined;
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
  const invalidScope = scopeError(body);
  if (invalidScope) {
    return Response.json({ error: invalidScope }, { status: 400 });
  }

  try {
    const outcome = await addForUser(
      body.mediaType,
      body.tmdbId,
      { userId: auth.user.id },
      body.posterPath,
      { seasonNumber: body.seasonNumber, episodeNumber: body.episodeNumber },
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
      seasonNumber: body.seasonNumber,
      episodeNumber: body.episodeNumber,
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

// ---------------------------------------------------------------------------
// POST /api/requests/:mediaType/:tmdbId/retry — look for it again
// ---------------------------------------------------------------------------

export async function handleRetryRequest(
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
  if (!Number.isInteger(tmdbId)) {
    return Response.json({ error: "Invalid id" }, { status: 400 });
  }

  const library = await getLibraryIndex();
  const entry = library[mediaType].get(tmdbId);
  if (!entry) {
    return Response.json({ error: "This is no longer in the library" }, { status: 404 });
  }

  try {
    const outcome = await retryRequest(mediaType, entry.serviceId);
    return Response.json(outcome, { headers: auth.refreshHeaders });
  } catch (error) {
    log.error("retry failed", { mediaType, tmdbId, error: errorMessage(error) });
    return errorResponse(error, 502, "Could not search again");
  }
}

// ---------------------------------------------------------------------------
// POST /api/requests/:mediaType/:tmdbId/report — hand it to an admin
// ---------------------------------------------------------------------------

export async function handleReportRequest(
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
  if (!Number.isInteger(tmdbId)) {
    return Response.json({ error: "Invalid id" }, { status: 400 });
  }

  const requests = await getMediaRequestsForUser(auth.user.id);
  const request = requests.find((row) => row.mediaType === mediaType && row.tmdbId === tmdbId);
  if (!request) {
    return Response.json({ error: "You have not requested this" }, { status: 404 });
  }

  try {
    const outcome = await reportProblem({
      mediaType,
      tmdbId,
      title: request.title,
      reportedBy: auth.user.name,
    });
    return Response.json(outcome, { headers: auth.refreshHeaders });
  } catch (error) {
    log.error("report failed", { mediaType, tmdbId, error: errorMessage(error) });
    return errorResponse(error, 502, "Could not pass this on");
  }
}
