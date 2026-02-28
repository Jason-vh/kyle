import type { BraveSearchOptions, BraveWebSearchResponse } from "./types.ts";

const BRAVE_API_KEY = process.env.BRAVE_API_KEY;

export async function searchWeb(
  query: string,
  options: BraveSearchOptions = {},
): Promise<BraveWebSearchResponse> {
  if (!BRAVE_API_KEY) {
    throw new Error("BRAVE_API_KEY environment variable is required");
  }

  const params = new URLSearchParams({ q: query });
  if (options.count) params.set("count", String(options.count));
  if (options.offset) params.set("offset", String(options.offset));
  if (options.freshness) params.set("freshness", options.freshness);

  const response = await fetch(`https://api.search.brave.com/res/v1/web/search?${params}`, {
    signal: AbortSignal.timeout(15_000),
    headers: {
      Accept: "application/json",
      "Accept-Encoding": "gzip",
      "X-Subscription-Token": BRAVE_API_KEY,
    },
  });

  if (!response.ok) {
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      body = await response.text().catch(() => "(unreadable)");
    }
    throw new Error(
      `Brave Search API error ${response.status} ${response.statusText}: ${JSON.stringify(body)}`,
    );
  }

  return (await response.json()) as BraveWebSearchResponse;
}
