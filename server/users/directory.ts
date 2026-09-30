import type { AdminUser } from "#shared/types.ts";
import { getAllUsersWithIdentities } from "#server/db/users.ts";
import { emptyFootprint, footprints } from "#server/db/merge.ts";
import { getPlexAvatars } from "#server/plex/access.ts";
import { getRequestedBytesByUser } from "#server/dashboard/storage.ts";
import { createLogger } from "#server/logger.ts";
import { errorMessage } from "#server/errors.ts";

const log = createLogger("user-directory");

async function requestedSizes(): Promise<Map<string, number> | undefined> {
  try {
    return await getRequestedBytesByUser();
  } catch (error) {
    log.warn("requested sizes unavailable", { error: errorMessage(error) });
    return undefined;
  }
}

function avatarOf(
  identities: { platform: string; platformUserId: string }[],
  avatars: Map<string, string>,
): string | undefined {
  const plex = identities.find((identity) => identity.platform === "plex");
  return plex ? avatars.get(plex.platformUserId) : undefined;
}

export async function listAdminUsers(
  options: { withRequestedSizes?: boolean } = {},
): Promise<AdminUser[]> {
  const [usersWithLinks, owned, avatars, sizes] = await Promise.all([
    getAllUsersWithIdentities(),
    footprints(),
    getPlexAvatars(),
    options.withRequestedSizes ? requestedSizes() : undefined,
  ]);

  return usersWithLinks.map((u) => ({
    id: u.id,
    displayName: u.displayName,
    avatarUrl: avatarOf(u.platformIdentities, avatars),
    isAdmin: u.isAdmin,
    createdAt: u.createdAt.toISOString(),
    lastSeenAt: u.lastSeenAt?.toISOString(),
    identities: u.platformIdentities.map((pi) => ({
      id: pi.id,
      platform: pi.platform,
      platformUserId: pi.platformUserId,
      platformUsername: pi.platformUsername,
    })),
    footprint: owned.get(u.id) ?? emptyFootprint(),
    requestedBytes: sizes && (sizes.get(u.id) ?? 0),
  }));
}

export async function getAdminUser(userId: string): Promise<AdminUser | undefined> {
  return (await listAdminUsers()).find((user) => user.id === userId);
}
