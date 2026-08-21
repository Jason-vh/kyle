import type { LibraryMediaType } from "../../../shared/types.ts";
import { requireAdmin, requireAuth } from "../../auth/middleware.ts";
import { listLibrary, removeLibraryItem } from "../../library/service.ts";
import { invalidateLibraryIndex } from "../../requests/library.ts";
import { createLogger } from "../../logger.ts";
import { errorMessage, errorResponse } from "../../errors.ts";

const log = createLogger("api-library");

function isMediaType(value: string): value is LibraryMediaType {
  return value === "movie" || value === "series";
}

// ---------------------------------------------------------------------------
// GET /api/library — everything Radarr and Sonarr hold
// ---------------------------------------------------------------------------

export async function handleGetLibrary(req: Request): Promise<Response> {
  const auth = await requireAuth(req);
  if ("error" in auth) return auth.error;

  try {
    const listing = await listLibrary(auth.user.id);
    return Response.json(listing, { headers: auth.refreshHeaders });
  } catch (error) {
    log.error("could not list the library", { error: errorMessage(error) });
    return errorResponse(error, 502, "Could not read the library");
  }
}

// ---------------------------------------------------------------------------
// DELETE /api/library/:mediaType/:serviceId — admin only
// ---------------------------------------------------------------------------

export async function handleRemoveLibraryItem(
  req: Request,
  mediaType: string,
  rawServiceId: string,
): Promise<Response> {
  // Browsing is for everyone; removing things is not.
  const auth = await requireAdmin(req);
  if ("error" in auth) return auth.error;

  if (!isMediaType(mediaType)) {
    return Response.json({ error: "Unknown media type" }, { status: 404 });
  }

  const serviceId = Number(rawServiceId);
  if (!Number.isInteger(serviceId)) {
    return Response.json({ error: "Invalid id" }, { status: 400 });
  }

  const deleteFiles = new URL(req.url).searchParams.get("deleteFiles") !== "false";

  try {
    await removeLibraryItem(mediaType, serviceId, deleteFiles);
    invalidateLibraryIndex();

    log.info("library item removed", { by: auth.user.id, mediaType, serviceId, deleteFiles });
    return Response.json({ success: true }, { headers: auth.refreshHeaders });
  } catch (error) {
    log.error("could not remove library item", {
      mediaType,
      serviceId,
      error: errorMessage(error),
    });
    return errorResponse(error, 502, "Could not remove this");
  }
}
