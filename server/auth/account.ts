import { getPlexAccountIds, getUserById } from "#server/db/users.ts";
import { checkPlexAccess } from "#server/plex/access.ts";

export async function getActiveUser(userId: string) {
  const user = await getUserById(userId);
  if (!user || user.isDisabled) return null;
  const plexAccounts = await getPlexAccountIds(user.id);
  if (plexAccounts.length === 0) return user;
  for (const plexAccountId of plexAccounts) {
    if ((await checkPlexAccess(plexAccountId)).allowed) return user;
  }
  return null;
}
