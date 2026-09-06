import type { DashboardResponse } from "#shared/types";
import { apiFetch } from "./client";

export type { ActivityItem, DashboardResponse, StorageStat } from "#shared/types";

export function getDashboard(): Promise<DashboardResponse> {
  return apiFetch<DashboardResponse>("/api/dashboard");
}
