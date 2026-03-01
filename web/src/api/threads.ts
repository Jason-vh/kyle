import { apiFetch } from "./client";
import type { ThreadListItem, ThreadDetail } from "@shared/types";

export function getThreads(): Promise<ThreadListItem[]> {
  return apiFetch<ThreadListItem[]>("/api/threads");
}

export function getThread(id: string, sig?: string): Promise<ThreadDetail> {
  const params = sig ? `?sig=${encodeURIComponent(sig)}` : "";
  return apiFetch<ThreadDetail>(`/api/threads/${id}${params}`);
}
