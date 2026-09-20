import { apiFetch } from "./client";
import type { ThreadListItem, ThreadDetail } from "#shared/types";

export function getThreads(): Promise<ThreadListItem[]> {
  return apiFetch<ThreadListItem[]>("/api/threads");
}

export function getThread(id: string): Promise<ThreadDetail> {
  return apiFetch<ThreadDetail>(`/api/threads/${id}`);
}
