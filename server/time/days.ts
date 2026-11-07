export interface DatedRelease {
  date: string;
  /** "in 3 days", "today", "49 days ago" — so the model never compares dates itself. */
  when: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Today as YYYY-MM-DD, on the same clock as the date in the system prompt. */
export function localToday(): string {
  return new Date().toLocaleDateString("en-CA");
}

export function relativeDay(date: string, today: string): string {
  const days = Math.round((Date.parse(date) - Date.parse(today)) / DAY_MS);
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  if (days === -1) return "yesterday";
  if (days > 0) return `in ${days} days`;
  return `${-days} days ago`;
}

/** Takes a bare date or a full timestamp, as TMDB and Radarr give them. */
export function datedRelease(date: string | null | undefined, today: string): DatedRelease | null {
  if (!date) return null;
  const day = date.slice(0, 10);
  return { date: day, when: relativeDay(day, today) };
}
