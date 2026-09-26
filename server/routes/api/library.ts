import { isLibraryMediaType } from "#shared/types.ts";
import { isInteger, readJsonObject } from "#server/http/input.ts";
import { requireAdmin, requireAuth } from "#server/auth/middleware.ts";
import { isRequester, listLibrary, removeLibraryItem } from "#server/library/service.ts";
import {
  followSeries,
  MediaNotFoundError,
  releaseSeason,
  setSeasonMonitored,
} from "#server/requests/service.ts";
import { createLogger } from "#server/logger.ts";
import { errorMessage, errorResponse } from "#server/errors.ts";

const log = createLogger("api-library");

// ---------------------------------------------------------------------------
// GET /api/library — everything Radarr and Sonarr hold
// ---------------------------------------------------------------------------

export async function handleGetLibrary(req: Request): Promise<Response> {
  const auth = await requireAuth(req);
  if ("error" in auth) return auth.error;

  try {
    const listing = await listLibrary(auth.user.id);
    return Response.json(listing);
  } catch (error) {
    log.error("could not list the library", { error: errorMessage(error) });
    return errorResponse(error, 502, "Could not read the library");
  }
}

// ---------------------------------------------------------------------------
// DELETE /api/library/:mediaType/:serviceId — an admin, or whoever requested it
// ---------------------------------------------------------------------------

export async function handleRemoveLibraryItem(
  req: Request,
  mediaType: string,
  rawServiceId: string,
): Promise<Response> {
  const auth = await requireAuth(req);
  if ("error" in auth) return auth.error;

  if (!isLibraryMediaType(mediaType)) {
    return Response.json({ error: "Unknown media type" }, { status: 404 });
  }

  const serviceId = Number(rawServiceId);
  if (!isInteger(serviceId, 1)) {
    return Response.json({ error: "Invalid id" }, { status: 400 });
  }

  const deleteFiles = new URL(req.url).searchParams.get("deleteFiles") !== "false";

  try {
    if (!auth.user.admin && !(await isRequester(auth.user.id, mediaType, serviceId))) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }

    await removeLibraryItem(mediaType, serviceId, deleteFiles, auth.user.name);

    log.info("library item removed", { by: auth.user.id, mediaType, serviceId, deleteFiles });
    return Response.json({ success: true });
  } catch (error) {
    log.error("could not remove library item", {
      mediaType,
      serviceId,
      error: errorMessage(error),
    });
    return errorResponse(error, 502, "Could not remove this");
  }
}

// ---------------------------------------------------------------------------
// DELETE /api/library/series/:serviceId/seasons/:seasonNumber — admin only
// ---------------------------------------------------------------------------

export async function handleReleaseSeason(
  req: Request,
  rawServiceId: string,
  rawSeasonNumber: string,
): Promise<Response> {
  const auth = await requireAdmin(req);
  if ("error" in auth) return auth.error;

  const serviceId = Number(rawServiceId);
  const seasonNumber = Number(rawSeasonNumber);
  if (!isInteger(serviceId, 1) || !isInteger(seasonNumber)) {
    return Response.json({ error: "Invalid id" }, { status: 400 });
  }

  try {
    const { filesDeleted } = await releaseSeason(serviceId, seasonNumber);

    log.info("season released", { by: auth.user.id, serviceId, seasonNumber, filesDeleted });
    return Response.json({ success: true, filesDeleted });
  } catch (error) {
    if (error instanceof MediaNotFoundError) {
      return Response.json({ error: error.message }, { status: 404 });
    }
    log.error("could not release season", {
      serviceId,
      seasonNumber,
      error: errorMessage(error),
    });
    return errorResponse(error, 502, "Could not release this season");
  }
}

// ---------------------------------------------------------------------------
// PUT /api/library/series/:serviceId/seasons/:seasonNumber — look for it, or stop
// ---------------------------------------------------------------------------

/** Whether a season is looked for is the requester's call, or an admin's. */
export async function handleMonitorSeason(
  req: Request,
  rawServiceId: string,
  rawSeasonNumber: string,
): Promise<Response> {
  const auth = await requireAuth(req);
  if ("error" in auth) return auth.error;

  const serviceId = Number(rawServiceId);
  const seasonNumber = Number(rawSeasonNumber);
  if (!isInteger(serviceId, 1) || !isInteger(seasonNumber)) {
    return Response.json({ error: "Invalid id" }, { status: 400 });
  }

  let body: Record<string, unknown>;
  try {
    body = await readJsonObject(req);
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const { monitored } = body;
  if (typeof monitored !== "boolean") {
    return Response.json({ error: "monitored must be a boolean" }, { status: 400 });
  }

  try {
    if (!auth.user.admin && !(await isRequester(auth.user.id, "series", serviceId))) {
      return Response.json(
        { error: "Only whoever asked for this, or an admin, can change it" },
        { status: 403 },
      );
    }

    const { changed } = await setSeasonMonitored(serviceId, seasonNumber, monitored);

    log.info("season monitoring set", {
      by: auth.user.id,
      serviceId,
      seasonNumber,
      monitored,
      changed,
    });
    return Response.json({ monitored });
  } catch (error) {
    if (error instanceof MediaNotFoundError) {
      return Response.json({ error: error.message }, { status: 404 });
    }
    log.error("could not set season monitoring", {
      serviceId,
      seasonNumber,
      monitored,
      error: errorMessage(error),
    });
    return errorResponse(error, 502, "Could not change this season");
  }
}

// ---------------------------------------------------------------------------
// PUT /api/library/series/:serviceId/follow — keep up with a series, or stop
// ---------------------------------------------------------------------------

/**
 * Following is asking for what comes next, which anyone may do; stopping
 * takes it away from whoever asked, so only they or an admin may.
 */
export async function handleFollowSeries(req: Request, rawServiceId: string): Promise<Response> {
  const auth = await requireAuth(req);
  if ("error" in auth) return auth.error;

  const serviceId = Number(rawServiceId);
  if (!isInteger(serviceId, 1)) {
    return Response.json({ error: "Invalid id" }, { status: 400 });
  }

  let body: Record<string, unknown>;
  try {
    body = await readJsonObject(req);
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const { follow } = body;
  if (typeof follow !== "boolean") {
    return Response.json({ error: "follow must be a boolean" }, { status: 400 });
  }

  try {
    if (!follow && !auth.user.admin && !(await isRequester(auth.user.id, "series", serviceId))) {
      return Response.json(
        { error: "Only whoever asked for this, or an admin, can stop following it" },
        { status: 403 },
      );
    }

    const { changed } = await followSeries({
      serviceId,
      follow,
      requestedBy: { userId: auth.user.id },
    });

    log.info("series following set", { by: auth.user.id, serviceId, follow, changed });
    return Response.json({ following: follow });
  } catch (error) {
    log.error("could not set following", { serviceId, follow, error: errorMessage(error) });
    return errorResponse(error, 502, "Could not change following");
  }
}
