import { requireAuth } from "../../auth/middleware.ts";
import { searchRequestableMedia } from "../../requests/search.ts";
import {
  MediaNotFoundError,
  requestMedia,
  type RequestableMediaType,
} from "../../requests/service.ts";
import { invalidateLibraryIndex } from "../../requests/library.ts";
import { getAllMediaRequests, getMediaRequestsForUser } from "../../db/requests.ts";
import { createLogger } from "../../logger.ts";
import { errorMessage } from "../../errors.ts";

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
    return Response.json({ error: "Search is unavailable right now" }, { status: 502 });
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
    const outcome = await requestMedia({
      userId: auth.user.id,
      mediaType: body.mediaType,
      tmdbId: body.tmdbId,
      posterPath: body.posterPath,
    });

    // The library gained a title, so the cached view of it is stale.
    if (outcome.status === "added") invalidateLibraryIndex();

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
    return Response.json({ error: "Could not add this to the library" }, { status: 502 });
  }
}

// ---------------------------------------------------------------------------
// GET /api/requests — your requests, or everyone's for an admin
// ---------------------------------------------------------------------------

export async function handleGetRequests(req: Request): Promise<Response> {
  const auth = await requireAuth(req);
  if ("error" in auth) return auth.error;

  const all = new URL(req.url).searchParams.get("all") === "true" && auth.user.admin;
  const requests = all ? await getAllMediaRequests() : await getMediaRequestsForUser(auth.user.id);

  return Response.json({ requests }, { headers: auth.refreshHeaders });
}
