import type { Watcher } from "#shared/types";

/** Whoever played it most recently, among those Plex dated a play for. */
export function lastWatch(watchers: Watcher[]): (Watcher & { watchedAt: string }) | undefined {
  let latest: (Watcher & { watchedAt: string }) | undefined;
  for (const watcher of watchers) {
    const { watchedAt } = watcher;
    if (watchedAt && (!latest || watchedAt > latest.watchedAt)) latest = { ...watcher, watchedAt };
  }
  return latest;
}
