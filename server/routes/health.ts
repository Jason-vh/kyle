import { getDeliveryHealth } from "#server/db/delivery-health.ts";
import { getJobHealth } from "#server/jobs/schedule.ts";

/** Commit SHA of the running build, set by the deploy workflow. */
const DEPLOY_ID = process.env.DEPLOY_ID?.trim() || "dev";

export async function handleHealth(): Promise<Response> {
  const deliveries = await getDeliveryHealth().catch(() => null);
  const scheduler = getJobHealth();
  const healthy = deliveries !== null && deliveries.healthy && scheduler.healthy;
  const status = healthy ? 200 : 503;
  return Response.json(
    {
      status: healthy ? "healthy" : "degraded",
      database: deliveries === null ? "disconnected" : "connected",
      workers: Object.fromEntries(
        Object.entries(scheduler.jobs).map(([name, job]) => [name, job.state]),
      ),
      deliveries: deliveries?.workers ?? null,
      deployId: DEPLOY_ID,
      timestamp: new Date().toISOString(),
    },
    { status },
  );
}
