import { checkDatabaseHealth } from "../db/index.ts";

export async function handleHealth(): Promise<Response> {
  const dbHealthy = await checkDatabaseHealth();

  const status = dbHealthy ? 200 : 503;
  return Response.json(
    {
      status: dbHealthy ? "healthy" : "degraded",
      database: dbHealthy ? "connected" : "disconnected",
      timestamp: new Date().toISOString(),
    },
    { status }
  );
}
