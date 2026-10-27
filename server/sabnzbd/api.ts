import { requireEnv } from "#server/config.ts";
import { safeJsonParse } from "#server/json.ts";

const TIMEOUT_MS = 15_000;

export interface SabQueue {
  paused: boolean;
  /** Minutes left on a timed pause, "0" when the pause has no end. */
  pause_int: string;
  noofslots: number;
  sizeleft: string;
}

/**
 * SABnzbd takes its key only as a query parameter, so this does not go through
 * the shared client, which logs the URL of every failed request.
 */
export async function getQueue(): Promise<SabQueue> {
  const [host, apiKey] = requireEnv("SABNZBD_HOST", "SABNZBD_API_KEY");
  const params = new URLSearchParams({ mode: "queue", limit: "0", output: "json", apikey: apiKey });

  const response = await fetch(`${host}/api?${params.toString()}`, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`sabnzbd API error ${response.status}`);

  // A rejected key comes back as a 200 with a line of plain text.
  const text = await response.text();
  const body = safeJsonParse<{ queue?: SabQueue }>(text);
  if (!body?.queue) throw new Error(`sabnzbd answered without a queue: ${text.slice(0, 80)}`);

  return body.queue;
}
