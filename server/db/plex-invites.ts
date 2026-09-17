import { eq } from "drizzle-orm";
import { db } from "./index.ts";
import { plexInvites, users } from "./schema.ts";

export interface PlexInviter {
  userId: string;
  name: string;
}

/**
 * Records who spent an invitation on an address.
 *
 * An address invited again — after the first invitation was withdrawn, or
 * ignored — belongs to whoever asked most recently.
 */
export async function recordPlexInvite(email: string, invitedByUserId: string): Promise<void> {
  await db
    .insert(plexInvites)
    .values({ email, invitedByUserId })
    .onConflictDoUpdate({
      target: plexInvites.email,
      set: { invitedByUserId, createdAt: new Date() },
    });
}

/** Who invited each address, keyed by the address. */
export async function getPlexInviters(): Promise<Map<string, PlexInviter>> {
  const rows = await db
    .select({ email: plexInvites.email, userId: users.id, name: users.displayName })
    .from(plexInvites)
    .innerJoin(users, eq(plexInvites.invitedByUserId, users.id));

  return new Map(rows.map(({ email, userId, name }) => [email, { userId, name }]));
}
