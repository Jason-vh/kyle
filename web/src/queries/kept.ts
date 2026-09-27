import type { UseQueryEntry } from "@pinia/colada";

const DAY_MS = 24 * 60 * 60 * 1000;

export const KEPT_BETWEEN_VISITS = { gcTime: DAY_MS, meta: { keptBetweenVisits: true } };

export function isKeptBetweenVisits(entry: UseQueryEntry): boolean {
  return entry.meta.keptBetweenVisits === true;
}
