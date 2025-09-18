export interface UltraStats {
  service_stats_info: {
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
  };
}