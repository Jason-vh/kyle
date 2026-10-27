/** How long a complaint stands before it is worth making again. */
const REPEAT_AFTER_MS = 12 * 60 * 60 * 1000;

/** What a health check last said out loud, and when. */
export interface Announced<Condition extends string> {
  condition: Condition;
  at: number;
}

/**
 * Whether a health check's finding is worth saying out loud. A condition is
 * announced when it changes, and repeated only if it has not been said for
 * half a day — a full disk that stays full should not fill Slack as well.
 */
export function shouldAnnounce<Condition extends string>(
  condition: Condition | "ok",
  last: Announced<Condition | "ok"> | null,
  now: number,
): boolean {
  if (!last) return condition !== "ok";
  if (last.condition !== condition) return true;
  return condition !== "ok" && now - last.at >= REPEAT_AFTER_MS;
}
