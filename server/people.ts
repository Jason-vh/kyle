import type { Person, Watcher } from "#shared/types.ts";
import type { PlexPerson } from "#server/plex/access.ts";
import type { AccountWatcher } from "#server/plex/history.ts";
import type { Removal } from "#server/db/removals.ts";
import { getNamesByPlexAccount, getPlatformIdentity, getPlexAccountIds } from "#server/db/users.ts";

export interface Viewer {
  userId: string;
  name: string;
  plexAccountId?: string;
  plexNames?: Map<string, string>;
}

export async function viewerOf(user: { id: string; name: string }): Promise<Viewer> {
  const [plex, held, plexNames] = await Promise.all([
    getPlatformIdentity(user.id, "plex"),
    getPlexAccountIds(user.id),
    getNamesByPlexAccount(),
  ]);
  return {
    userId: user.id,
    name: user.name,
    plexAccountId: plex?.platformUserId ?? held[0],
    plexNames,
  };
}

export function marked<T extends Person>(person: T, you: boolean): T {
  return you ? { ...person, you: true } : person;
}

export function plexPersonFor(person: PlexPerson, viewer: Viewer): Person {
  const { accountId, ...rest } = person;
  const name = viewer.plexNames?.get(accountId) ?? rest.name;
  return marked({ ...rest, name }, accountId === viewer.plexAccountId);
}

export function watchersFor(watchers: AccountWatcher[], viewer: Viewer): Watcher[] {
  return watchers.map(({ watchedAt, ...person }) => {
    const shown = plexPersonFor(person, viewer);
    return watchedAt ? { ...shown, watchedAt } : shown;
  });
}

export function removedByViewer(removal: Removal, viewer: Viewer): boolean {
  if (removal.removedByUserId) return removal.removedByUserId === viewer.userId;
  return removal.removedBy === viewer.name;
}
