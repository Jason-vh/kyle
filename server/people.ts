import type { Person, Watcher } from "#shared/types.ts";
import type { PlexPerson } from "#server/plex/access.ts";
import type { AccountWatcher } from "#server/plex/history.ts";
import type { Removal } from "#server/db/removals.ts";
import { getUserById } from "#server/db/users.ts";

export interface Viewer {
  userId: string;
  name: string;
  plexAccountId?: string;
}

export async function viewerOf(user: { id: string; name: string }): Promise<Viewer> {
  const row = await getUserById(user.id);
  return { userId: user.id, name: user.name, plexAccountId: row?.plexAccountId ?? undefined };
}

export function marked<T extends Person>(person: T, you: boolean): T {
  return you ? { ...person, you: true } : person;
}

export function plexPersonFor(person: PlexPerson, viewer: Viewer): Person {
  const { accountId, ...rest } = person;
  return marked(rest, accountId === viewer.plexAccountId);
}

export function watchersFor(watchers: AccountWatcher[], viewer: Viewer): Watcher[] {
  return watchers.map(({ accountId, ...watcher }) =>
    marked(watcher, accountId === viewer.plexAccountId),
  );
}

export function removedByViewer(removal: Removal, viewer: Viewer): boolean {
  if (removal.removedByUserId) return removal.removedByUserId === viewer.userId;
  return removal.removedBy === viewer.name;
}
