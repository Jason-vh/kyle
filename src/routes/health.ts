import { checkDatabaseHealth } from "../db/index.ts";

import { resolve, dirname } from "node:path";

const projectRoot = resolve(dirname(import.meta.dir), "..");
const DEPLOY_ID = await Bun.file(resolve(projectRoot, "deploy-id.txt")).text().then(s => s.trim()).catch(() => "dev");

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
