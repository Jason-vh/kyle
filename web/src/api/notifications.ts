import type { NotificationsResponse } from "#shared/types";
import { apiFetch } from "./client";

export type { AppNotification, NotificationsResponse } from "#shared/types";

export function getNotifications(): Promise<NotificationsResponse> {
  return apiFetch<NotificationsResponse>("/api/notifications");
}

/** Marks everything read; the bell has no per-item control. */
export function markNotificationsRead(): Promise<{ read: number }> {
  return apiFetch<{ read: number }>("/api/notifications/read", {
    method: "POST",
    body: JSON.stringify({}),
  });
}
