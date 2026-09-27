import type { AdminUser } from "#shared/types.ts";
import { getAllUsersWithIdentities } from "#server/db/users.ts";
import { emptyFootprint, footprints } from "#server/db/merge.ts";
import { getPlexAvatars } from "#server/plex/access.ts";

function avatarOf(
  identities: { platform: string; platformUserId: string }[],
  avatars: Map<string, string>,
): string | undefined {
  const plex = identities.find((identity) => identity.platform === "plex");
  return plex ? avatars.get(plex.platformUserId) : undefined;
}

/** Everyone with an account, how they sign in, and how much they own. */
export async function listAdminUsers(): Promise<AdminUser[]> {
  const [usersWithLinks, owned, avatars] = await Promise.all([
    getAllUsersWithIdentities(),
    footprints(),
    getPlexAvatars(),
  ]);

  return usersWithLinks.map((u) => ({
    id: u.id,
    displayName: u.displayName,
    avatarUrl: avatarOf(u.platformIdentities, avatars),
    isAdmin: u.isAdmin,
    createdAt: u.createdAt.toISOString(),
    identities: u.platformIdentities.map((pi) => ({
      id: pi.id,
      platform: pi.platform,
      platformUserId: pi.platformUserId,
      platformUsername: pi.platformUsername,
    })),
    footprint: owned.get(u.id) ?? emptyFootprint(),
  }));
}

export async function getAdminUser(userId: string): Promise<AdminUser | undefined> {
  return (await listAdminUsers()).find((user) => user.id === userId);
}
