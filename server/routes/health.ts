import { checkDatabaseHealth } from "#server/db/index.ts";
import { getJobHealth } from "#server/jobs/schedule.ts";

/** Commit SHA of the running build, set by the deploy workflow. */
const DEPLOY_ID = process.env.DEPLOY_ID?.trim() || "dev";

export async function handleHealth(): Promise<Response> {
  const dbHealthy = await checkDatabaseHealth();

  const scheduler = getJobHealth();
  const healthy = dbHealthy && scheduler.healthy;
  const status = healthy ? 200 : 503;
  return Response.json(
    {
      status: healthy ? "healthy" : "degraded",
      database: dbHealthy ? "connected" : "disconnected",
      workers: Object.fromEntries(
        Object.entries(scheduler.jobs).map(([name, job]) => [name, job.state]),
      ),
      deployId: DEPLOY_ID,
      timestamp: new Date().toISOString(),
    },
    { status },
  );
}
