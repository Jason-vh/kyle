import { checkDatabaseHealth } from "../db/index.ts";

/** Commit SHA of the running build, set by the deploy workflow. */
const DEPLOY_ID = process.env.DEPLOY_ID?.trim() || "dev";

export async function handleHealth(): Promise<Response> {
  const dbHealthy = await checkDatabaseHealth();

  const status = dbHealthy ? 200 : 503;
  return Response.json(
    {
      status: dbHealthy ? "healthy" : "degraded",
      database: dbHealthy ? "connected" : "disconnected",
      deployId: DEPLOY_ID,
      timestamp: new Date().toISOString(),
    },
    { status },
  );
}
