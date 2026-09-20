import { requireAuth } from "#server/auth/middleware.ts";
import { isUuid, readJsonObject } from "#server/http/input.ts";
import { countUnread, listNotifications, markRead } from "#server/db/notifications.ts";
import { createLogger } from "#server/logger.ts";
import { errorMessage, errorResponse } from "#server/errors.ts";

const log = createLogger("api-notifications");

// ---------------------------------------------------------------------------
// GET /api/notifications — what Kyle has to tell you
// ---------------------------------------------------------------------------

export async function handleGetNotifications(req: Request): Promise<Response> {
  const auth = await requireAuth(req);
  if ("error" in auth) return auth.error;

  try {
    const [notifications, unread] = await Promise.all([
      listNotifications(auth.user.id),
      countUnread(auth.user.id),
    ]);
    return Response.json({ notifications, unread }, { headers: auth.refreshHeaders });
  } catch (error) {
    log.error("could not list notifications", { error: errorMessage(error) });
    return errorResponse(error, 500, "Could not load notifications");
  }
}

// ---------------------------------------------------------------------------
// POST /api/notifications/read — all of them, or the ones named
// ---------------------------------------------------------------------------

export async function handleMarkNotificationsRead(req: Request): Promise<Response> {
  const auth = await requireAuth(req);
  if ("error" in auth) return auth.error;

  // An empty body means "all of them", which is what the bell does.
  let body: Record<string, unknown>;
  try {
    body = await readJsonObject(req, true);
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (body.ids !== undefined && (!Array.isArray(body.ids) || !body.ids.every(isUuid))) {
    return Response.json({ error: "ids must be an array of notification UUIDs" }, { status: 400 });
  }
  const ids = body.ids as string[] | undefined;

  try {
    const read = await markRead(auth.user.id, ids);
    return Response.json({ read }, { headers: auth.refreshHeaders });
  } catch (error) {
    log.error("could not mark notifications read", { error: errorMessage(error) });
    return errorResponse(error, 500, "Could not update notifications");
  }
}
