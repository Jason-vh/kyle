import { getQueue, type SabQueue } from "./api.ts";
import { alertAdmins } from "#server/slack/alerts.ts";
import { readState, writeState } from "#server/db/jobs.ts";
import { shouldAnnounce, type Announced } from "#server/jobs/announce.ts";
import { createLogger } from "#server/logger.ts";
import { errorMessage } from "#server/errors.ts";

const log = createLogger("sabnzbd-health");

export type Condition = "ok" | "paused" | "unreachable";

/** A timed pause ends by itself; one without an end waits for a person, however long. */
export function conditionFor(queue: SabQueue): Condition {
  return queue.paused && queue.pause_int === "0" ? "paused" : "ok";
}

export function announcement(condition: Condition, queue?: SabQueue, reason?: string): string {
  if (condition === "unreachable") {
    return `:warning: *SABnzbd is not answering.* Kyle cannot tell whether usenet downloads are moving.\n>${reason ?? "no reason given"}`;
  }

  if (condition === "paused") {
    const waiting = queue ? `${queue.noofslots} downloads (${queue.sizeleft})` : "Every download";
    return `:double_vertical_bar: *SABnzbd is paused.* ${waiting} are waiting, and nothing will move until somebody resumes it — it pauses itself after a disk error.`;
  }

  return ":white_check_mark: *SABnzbd is downloading again.*";
}

const STATE_KEY = "sabnzbd-health:announced";

/** Tells the admins when SABnzbd stops downloading, and when it starts again. */
export async function checkSabnzbd(): Promise<{ condition: Condition; announced: boolean }> {
  let queue: SabQueue | undefined;
  let reason: string | undefined;

  try {
    queue = await getQueue();
  } catch (error) {
    reason = errorMessage(error);
  }

  const condition: Condition = queue ? conditionFor(queue) : "unreachable";
  const now = Date.now();
  const last = await readState<Announced<Condition>>(STATE_KEY);
  const announced = shouldAnnounce(condition, last ?? null, now);

  if (announced) {
    await alertAdmins(announcement(condition, queue, reason));
    await writeState(STATE_KEY, { condition, at: now });
  }

  log.info("checked sabnzbd", { condition, announced, reason });
  return { condition, announced };
}
