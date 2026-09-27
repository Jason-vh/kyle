import { and, eq, gt } from "drizzle-orm";
import { db } from "#server/db/index.ts";
import { linkCodes } from "#server/db/schema.ts";
import { createPlatformLink, getUserById, resolveAppUserId } from "#server/db/users.ts";
import { withDatabaseLock } from "#server/db/lock.ts";
import { appOrigin } from "#server/config.ts";
import { createLogger } from "#server/logger.ts";

const log = createLogger("link-codes");

export const LINKABLE_PLATFORMS = ["slack", "discord"] as const;

export type LinkablePlatform = (typeof LINKABLE_PLATFORMS)[number];

const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 6;
const TTL_MS = 10 * 60 * 1000;

const COMMAND = new RegExp(`^link\\s+([${ALPHABET}]{${CODE_LENGTH}})$`, "i");

export function isLinkablePlatform(value: string): value is LinkablePlatform {
  return (LINKABLE_PLATFORMS as readonly string[]).includes(value);
}

function newCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(CODE_LENGTH));
  return [...bytes].map((byte) => ALPHABET[byte % ALPHABET.length]).join("");
}

/** A fresh code replaces any the user was already given for that platform. */
export async function issueLinkCode(
  userId: string,
  platform: LinkablePlatform,
): Promise<{ code: string; expiresAt: string }> {
  const code = newCode();
  const expiresAt = new Date(Date.now() + TTL_MS);

  await db.transaction(async (tx) => {
    await tx
      .delete(linkCodes)
      .where(and(eq(linkCodes.userId, userId), eq(linkCodes.platform, platform)));
    await tx.insert(linkCodes).values({ code, userId, platform, expiresAt });
  });

  return { code, expiresAt: expiresAt.toISOString() };
}

/** The code in a "link ABC123" message, if that is all the message says. */
export function parseLinkCommand(text: string): string | undefined {
  return COMMAND.exec(text.trim())?.[1]?.toUpperCase();
}

export type LinkOutcome =
  | { kind: "linked"; name: string }
  | { kind: "already" }
  | { kind: "taken" }
  | { kind: "invalid" };

/** Used once, whatever the outcome, so a code cannot be tried against two accounts. */
async function consume(code: string, platform: LinkablePlatform): Promise<string | undefined> {
  const [row] = await db
    .delete(linkCodes)
    .where(
      and(
        eq(linkCodes.code, code),
        eq(linkCodes.platform, platform),
        gt(linkCodes.expiresAt, new Date()),
      ),
    )
    .returning({ userId: linkCodes.userId });
  return row?.userId;
}

/**
 * Attach the account a message came from to whoever was given the code. An
 * account already attached to someone else stays put: proving this one account
 * says nothing about everything the other user holds, so that is a merge.
 */
export async function redeemLinkCode(
  code: string,
  platform: LinkablePlatform,
  platformUserId: string,
  platformUsername?: string,
): Promise<LinkOutcome> {
  return withDatabaseLock(`platform-account:${platform}:${platformUserId}`, async () => {
    const userId = await consume(code, platform);
    if (!userId) return { kind: "invalid" };

    const user = await getUserById(userId);
    if (!user || user.isDisabled) return { kind: "invalid" };

    const owner = await resolveAppUserId(platform, platformUserId);
    if (owner === userId) return { kind: "already" };
    if (owner) return { kind: "taken" };

    await createPlatformLink(userId, platform, platformUserId, platformUsername);
    log.info("account linked by code", { userId, platform });
    return { kind: "linked", name: user.displayName };
  });
}

const PLATFORM_NAMES: Record<LinkablePlatform, string> = { slack: "Slack", discord: "Discord" };

export function linkReply(outcome: LinkOutcome, platform: LinkablePlatform): string {
  const account = `this ${PLATFORM_NAMES[platform]} account`;
  switch (outcome.kind) {
    case "linked":
      return `Linked ${account} to ${outcome.name}. Ask away.`;
    case "already":
      return `${capitalized(account)} is already linked to you.`;
    case "taken":
      return `${capitalized(account)} belongs to another Kyle user. Ask an admin to merge the two.`;
    case "invalid":
      return `That code is wrong or has expired. Get a new one at ${appOrigin()}/account.`;
  }
}

export function unlinkedReply(platform: LinkablePlatform): string {
  return `Link your ${PLATFORM_NAMES[platform]} account first: open ${appOrigin()}/account, choose Link ${PLATFORM_NAMES[platform]}, and send me the code.`;
}

function capitalized(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
