import { isLibraryMediaType } from "#shared/types.ts";
import { isInteger } from "#server/http/input.ts";
import { requireAdmin, requireAuth } from "#server/auth/middleware.ts";
import { isRequester, listLibrary, removeLibraryItem } from "#server/library/service.ts";
import { MediaNotFoundError, releaseSeason } from "#server/requests/service.ts";
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
