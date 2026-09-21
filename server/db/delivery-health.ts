import { sql } from "drizzle-orm";
import { query } from "./index.ts";

interface DeliverySummary {
  pending: number;
  failed: number;
  overdue: number;
  maxAttempts: number;
  oldestPendingAt: string | null;
}

export async function getDeliveryHealth(now = new Date()) {
  const overdueBefore = new Date(now.getTime() - 5 * 60_000).toISOString();
  const rows = await query<DeliverySummary & { worker: "webhooks" | "slack" }>(sql`
    SELECT 'webhooks' AS worker,
      count(*)::integer AS pending,
      count(*) FILTER (WHERE last_error IS NOT NULL)::integer AS failed,
      count(*) FILTER (WHERE available_at < ${overdueBefore}::timestamp)::integer AS overdue,
      coalesce(max(attempts), 0)::integer AS "maxAttempts",
      min(created_at) AS "oldestPendingAt"
    FROM webhook_jobs WHERE completed_at IS NULL
    UNION ALL
    SELECT 'slack' AS worker,
      count(*)::integer AS pending,
      count(*) FILTER (WHERE last_error IS NOT NULL)::integer AS failed,
      count(*) FILTER (WHERE available_at < ${overdueBefore}::timestamp)::integer AS overdue,
      coalesce(max(attempts), 0)::integer AS "maxAttempts",
      min(created_at) AS "oldestPendingAt"
    FROM slack_event_jobs WHERE completed_at IS NULL
  `);
  const workers = Object.fromEntries(rows.map(({ worker, ...summary }) => [worker, summary]));
  return {
    healthy: rows.every((row) => row.failed === 0 && row.overdue === 0),
    workers,
  };
}
