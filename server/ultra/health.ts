import type { StorageStat } from "#shared/types.ts";
import { getStorage } from "#server/dashboard/storage.ts";
import { invalidateStats } from "./api.ts";
import { alertAdmins } from "#server/slack/alerts.ts";
import { createLogger } from "#server/logger.ts";
import { errorMessage } from "#server/errors.ts";

const log = createLogger("seedbox-health");

/** Under this much of the quota left, the box is about to stop accepting downloads. */
const LOW_FRACTION = 0.05;

/** How long a complaint stands before it is worth making again. */
const REPEAT_AFTER_MS = 12 * 60 * 60 * 1000;

export type Condition = "ok" | "low" | "unreachable";

export function conditionFor(stat: StorageStat): Condition {
  if (stat.totalBytes <= 0) return "ok";
  return stat.freeBytes / stat.totalBytes < LOW_FRACTION ? "low" : "ok";
}

export interface Announced {
  condition: Condition;
  at: number;
}

/**
 * Whether this is worth saying out loud. A condition is announced when it
 * changes, and repeated only if it has not been said for half a day — a full
 * disk that stays full should not fill Slack as well.
 */
export function shouldAnnounce(condition: Condition, last: Announced | null, now: number): boolean {
  if (!last) return condition !== "ok";
  if (last.condition !== condition) return true;
  return condition !== "ok" && now - last.at >= REPEAT_AFTER_MS;
}

const UNITS = ["B", "KB", "MB", "GB", "TB"];

/** Decimal units, matching what the dashboard shows for the same figure. */
export function formatBytes(bytes: number): string {
  if (bytes <= 0) return "0 B";
  const exponent = Math.min(Math.floor(Math.log10(bytes) / 3), UNITS.length - 1);
  const value = bytes / 1000 ** exponent;
  return `${value.toFixed(value >= 10 || exponent === 0 ? 0 : 1)} ${UNITS[exponent]}`;
}

export function announcement(condition: Condition, stat?: StorageStat, reason?: string): string {
  if (condition === "unreachable") {
    return `:warning: *The seedbox is not answering.* Kyle cannot read the quota, so the dashboard has no space to show.\n>${reason ?? "no reason given"}`;
  }

  const free = stat ? formatBytes(stat.freeBytes) : "an unknown amount";
  const total = stat ? formatBytes(stat.totalBytes) : "unknown";
  const percent = stat && stat.totalBytes > 0 ? (stat.freeBytes / stat.totalBytes) * 100 : 0;

  if (condition === "low") {
    return `:warning: *The seedbox is nearly full.* ${free} left of ${total} (${percent.toFixed(1)}%). Downloads will start failing.`;
  }

  return `:white_check_mark: *The seedbox is fine again.* ${free} left of ${total} (${percent.toFixed(1)}%).`;
}

let lastAnnounced: Announced | null = null;

export function forgetAnnouncements(): void {
  lastAnnounced = null;
}

/**
 * Reads the quota and tells the admins when the answer is bad, or good again
 * after being bad. Meant for the scheduler; safe to call as often as it likes.
 */
export async function checkSeedbox(): Promise<{ condition: Condition; announced: boolean }> {
  // The quota is cached for the dashboard's sake; a health check wants to know
  // whether the seedbox answers now, not ten minutes ago.
  invalidateStats();

  let stat: StorageStat | undefined;
  let reason: string | undefined;

  try {
    stat = await getStorage();
  } catch (error) {
    reason = errorMessage(error);
  }

  const condition: Condition = stat ? conditionFor(stat) : "unreachable";
  const now = Date.now();
  const announced = shouldAnnounce(condition, lastAnnounced, now);

  if (announced) {
    await alertAdmins(announcement(condition, stat, reason));
    lastAnnounced = { condition, at: now };
  } else if (!lastAnnounced) {
    lastAnnounced = { condition, at: now };
  }

  log.info("checked the seedbox", { condition, announced, reason });
  return { condition, announced };
}
