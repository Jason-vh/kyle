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

/** "3h 20m", "45m", "0m" — a duration a person reads at a glance. */
export function formatDuration(minutes: number): string {
  const whole = Math.round(minutes);
  const hours = Math.floor(whole / 60);
  if (hours === 0) return `${whole}m`;
  return `${hours}h ${whole % 60}m`;
}
