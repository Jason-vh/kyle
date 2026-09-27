import type { AppNotification } from "#shared/types";
import { formatDate } from "./format";

export interface NotificationDay {
  label: string;
  items: AppNotification[];
}

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

function dayLabel(iso: string, now: Date): string {
  const days = Math.round((startOfDay(now) - startOfDay(new Date(iso))) / 86_400_000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  return formatDate(iso, now);
}

export function groupByDay(items: AppNotification[], now: Date = new Date()): NotificationDay[] {
  const days: NotificationDay[] = [];
  for (const item of items) {
    const label = dayLabel(item.createdAt, now);
    const last = days.at(-1);
    if (last?.label === label) last.items.push(item);
    else days.push({ label, items: [item] });
  }
  return days;
}

export function timeOfDay(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "numeric", minute: "2-digit" });
}
