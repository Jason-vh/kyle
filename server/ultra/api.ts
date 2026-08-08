import { createApiClient } from "../http/client.ts";
import { requireEnv } from "../config.ts";

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

export async function getStats(): Promise<UltraStats> {
  const data = await request<UltraStatsResponse>("/total-stats");
  return data.service_stats_info;
}
