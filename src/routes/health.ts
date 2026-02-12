import { checkDatabaseHealth } from "../db/index.ts";

const DEPLOY_ID = await Bun.file("deploy-id.txt").text().then(s => s.trim()).catch(() => "dev");

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
    { status }
  );
}
