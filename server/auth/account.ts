import { getUserById } from "#server/db/users.ts";
import { checkPlexAccess } from "#server/plex/access.ts";

export async function getActiveUser(userId: string) {
  const user = await getUserById(userId);
  if (!user || user.isDisabled) return null;
  if (user.plexAccountId && !(await checkPlexAccess(user.plexAccountId)).allowed) return null;
  return user;
}
