/** "Bob", "Bob and Jane", "Bob, Jane and Sue". */
export function formatNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

const SIZE_UNITS = ["B", "KB", "MB", "GB", "TB"];

/** Decimal units, matching what Radarr, Sonarr and disks report. */
export function formatSize(bytes: number): string {
  if (bytes <= 0) return "—";
  const exponent = Math.min(Math.floor(Math.log10(bytes) / 3), SIZE_UNITS.length - 1);
  const value = bytes / 1000 ** exponent;
  return `${value.toFixed(value >= 10 || exponent === 0 ? 0 : 1)} ${SIZE_UNITS[exponent]}`;
}

/** "6 Mar", or "6 Mar 2026" once the year stops being obvious. */
export function formatDate(iso: string, now = new Date()): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";

  const sameYear = date.getFullYear() === now.getFullYear();
  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: sameYear ? undefined : "numeric",
  });
}

/** "3h 20m", "45m", "0m" — a duration a person reads at a glance. */
export function formatDuration(minutes: number): string {
  const whole = Math.round(minutes);
  const hours = Math.floor(whole / 60);
  if (hours === 0) return `${whole}m`;
  return `${hours}h ${whole % 60}m`;
}

/** "42h", or "45m" under an hour: a week's total, where minutes are noise. */
export function formatHours(minutes: number): string {
  const whole = Math.round(minutes);
  if (whole < 60) return `${whole}m`;
  return `${Math.round(whole / 60)}h`;
}

/**
 * What a download client's "00:12:31" or "1.02:00:00" leaves, read aloud:
 * "12 min", "2h 5m", "1d 2h". Empty for anything it cannot read.
 */
export function formatEta(eta: string): string {
  const match = /^(?:(\d+)\.)?(\d+):(\d+):(\d+)$/.exec(eta);
  if (!match) return "";

  const [, days = "0", hours = "0", minutes = "0"] = match;
  const d = Number(days);
  const h = Number(hours);
  const m = Number(minutes);

  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${Math.max(1, m)} min`;
}
