import { requireAuth } from "#server/auth/middleware.ts";
import { isInteger, readJsonObject } from "#server/http/input.ts";
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
  if (query.length > 200) return Response.json({ error: "Search is too long" }, { status: 400 });

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
  if (seasonNumber !== undefined && !isInteger(seasonNumber)) {
    return "seasonNumber must be a non-negative integer";
  }
  if (episodeNumber === undefined) return undefined;
  if (seasonNumber === undefined) return "episodeNumber needs a seasonNumber";
  if (!isInteger(episodeNumber, 1)) {
    return "episodeNumber must be a positive integer";
  }
  return undefined;
}

export async function handleCreateRequest(req: Request): Promise<Response> {
  const auth = await requireAuth(req);
  if ("error" in auth) return auth.error;

  let body: RequestBody;
  try {
    body = await readJsonObject(req);
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!isRequestableType(body.mediaType)) {
    return Response.json({ error: "mediaType must be 'movie' or 'series'" }, { status: 400 });
  }
  if (!isInteger(body.tmdbId, 1)) {
    return Response.json({ error: "tmdbId must be a positive integer" }, { status: 400 });
  }
  if (
    body.posterPath !== undefined &&
    (typeof body.posterPath !== "string" || body.posterPath.length > 2048)
  ) {
    return Response.json({ error: "Invalid posterPath" }, { status: 400 });
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
    return Response.json(outcome);
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

  return Response.json({ requests: await withState(rows) });
}

// ---------------------------------------------------------------------------
// POST /api/requests/:mediaType/:tmdbId/retry — look for it again
// ---------------------------------------------------------------------------

/** `?season=3` narrows an action to the season that was asked for. */
function seasonParam(req: Request): number | undefined | Response {
  const raw = new URL(req.url).searchParams.get("season");
  if (raw === null) return undefined;

  const seasonNumber = Number(raw);
  if (raw.trim() === "" || !isInteger(seasonNumber)) {
    return Response.json({ error: "Invalid season" }, { status: 400 });
  }
  return seasonNumber;
}

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
  if (!isInteger(tmdbId, 1)) {
    return Response.json({ error: "Invalid id" }, { status: 400 });
  }
  const seasonNumber = seasonParam(req);
  if (seasonNumber instanceof Response) return seasonNumber;

  const library = await getLibraryIndex();
  if (library.unavailable.includes(mediaType)) {
    return Response.json({ error: "Library service is unavailable" }, { status: 503 });
  }
  const entry = library[mediaType].get(tmdbId);
  if (!entry) {
    return Response.json({ error: "This is no longer in the library" }, { status: 404 });
  }

  try {
    const outcome = await retryRequest(mediaType, entry.serviceId, seasonNumber);
    return Response.json(outcome);
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
  if (!isInteger(tmdbId, 1)) {
    return Response.json({ error: "Invalid id" }, { status: 400 });
  }

  const seasonNumber = seasonParam(req);
  if (seasonNumber instanceof Response) return seasonNumber;
  const requests = await getMediaRequestsForUser(auth.user.id);
  const request = requests.find(
    (row) =>
      row.mediaType === mediaType &&
      row.tmdbId === tmdbId &&
      row.seasonNumber === (seasonNumber ?? null),
  );
  if (!request) {
    return Response.json({ error: "You have not requested this" }, { status: 404 });
  }

  try {
    const outcome = await reportProblem({
      mediaType,
      tmdbId,
      title: request.title,
      reportedBy: auth.user.name,
      seasonNumber,
    });
    return Response.json(outcome);
  } catch (error) {
    log.error("report failed", { mediaType, tmdbId, error: errorMessage(error) });
    return errorResponse(error, 502, "Could not pass this on");
  }
}
