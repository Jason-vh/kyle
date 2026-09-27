import { createApiClient } from "#server/http/client.ts";
import { requireEnv } from "#server/config.ts";
import { cached } from "#server/cache.ts";

export interface UltraStats {
  free_storage_bytes: number;
  free_storage_gb: number;
  last_traffic_reset: string;
  next_traffic_reset: string;
  total_storage_unit: string;
  total_storage_value: number;
  traffic_available_percentage: number;
  traffic_used_percentage: number;
  used_storage_unit: string;
  used_storage_value: number;
}

interface UltraStatsResponse {
  service_stats_info: UltraStats;
}

const request = createApiClient({
  service: "ultra",
  config: () => {
    const [host, token] = requireEnv("ULTRA_HOST", "ULTRA_API_TOKEN");
    return {
      baseUrl: `${host}/ultra-api`,
      headers: { Authorization: `Bearer ${token}` },
    };
  },
});

/**
 * The seedbox answers 10 times an hour and no more, which a dashboard on a
 * phone would spend in a minute. The quota moves slowly; a stale minute of it
 * costs nothing.
 */
const CACHE_TTL_MS = 10 * 60 * 1000;

const stats = cached(CACHE_TTL_MS, async () => {
  const data = await request<UltraStatsResponse>("/total-stats");
  return data.service_stats_info;
});

export function getStats(): Promise<UltraStats> {
  return stats.get();
}

export function invalidateStats(): void {
  stats.invalidate();
}
