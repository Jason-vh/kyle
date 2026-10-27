import { requireEnv } from "#server/config.ts";
import { safeJsonParse } from "#server/json.ts";

const TIMEOUT_MS = 15_000;

export interface SabSlot {
  filename: string;
  cat: string;
  status: string;
  percentage: string;
  sizeleft: string;
  timeleft: string;
}

export interface SabQueue {
  status: string;
  speed: string;
  timeleft: string;
  paused: boolean;
  /** Minutes left on a timed pause, "0" when the pause has no end. */
  pause_int: string;
  noofslots: number;
  sizeleft: string;
  slots: SabSlot[];
}

interface SabHistory {
  /** Downloads being verified, repaired or unpacked right now. */
  ppslots: number;
}

/**
 * SABnzbd takes its key only as a query parameter, so this does not go through
 * the shared client, which logs the URL of every failed request.
 */
async function call<K extends string, T>(mode: K, params: Record<string, string>): Promise<T> {
  const [host, apiKey] = requireEnv("SABNZBD_HOST", "SABNZBD_API_KEY");
  const query = new URLSearchParams({ ...params, mode, output: "json", apikey: apiKey });

  const response = await fetch(`${host}/api?${query.toString()}`, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`sabnzbd API error ${response.status}`);

  // A rejected key comes back as a 200 with a line of plain text.
  const text = await response.text();
  const body = safeJsonParse<Record<K, T>>(text)?.[mode];
  if (!body) throw new Error(`sabnzbd answered without a ${mode}: ${text.slice(0, 80)}`);

  return body;
}

/** The queue with its first `limit` downloads; 0 for the totals alone. */
export function getQueue(limit = 0): Promise<SabQueue> {
  return call<"queue", SabQueue>("queue", { limit: String(limit) });
}

/** How many finished downloads are being post-processed. */
export async function getPostProcessingCount(): Promise<number> {
  const history = await call<"history", SabHistory>("history", { limit: "0" });
  return history.ppslots;
}
