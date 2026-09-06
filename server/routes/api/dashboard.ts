import { requireAuth } from "../../auth/middleware.ts";
import { getDashboard } from "../../dashboard/service.ts";
import { createLogger } from "../../logger.ts";
import { errorMessage, errorResponse } from "../../errors.ts";

const log = createLogger("api-dashboard");

// ---------------------------------------------------------------------------
// GET /api/dashboard — the home screen, from the viewer's point of view
// ---------------------------------------------------------------------------

export async function handleGetDashboard(req: Request): Promise<Response> {
  const auth = await requireAuth(req);
  if ("error" in auth) return auth.error;

  try {
    const dashboard = await getDashboard(auth.user.id);
    return Response.json(dashboard, { headers: auth.refreshHeaders });
  } catch (error) {
    log.error("could not build the dashboard", { error: errorMessage(error) });
    return errorResponse(error, 502, "Could not load the dashboard");
  }
}
