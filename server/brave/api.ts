import type { BraveSearchOptions, BraveWebSearchResponse } from "./types.ts";
import { createApiClient } from "../http/client.ts";
import { requireEnv } from "../config.ts";

const request = createApiClient({
  service: "brave",
  config: () => {
    const [apiKey] = requireEnv("BRAVE_API_KEY");
    return {
      baseUrl: "https://api.search.brave.com/res/v1",
      headers: {
        Accept: "application/json",
        "Accept-Encoding": "gzip",
        "X-Subscription-Token": apiKey,
      },
    };
  },
});

export async function searchWeb(
  query: string,
  options: BraveSearchOptions = {},
): Promise<BraveWebSearchResponse> {
  const params = new URLSearchParams({ q: query });
  if (options.count) params.set("count", String(options.count));
  if (options.offset) params.set("offset", String(options.offset));
  if (options.freshness) params.set("freshness", options.freshness);

  return request<BraveWebSearchResponse>(`/web/search?${params}`);
}
