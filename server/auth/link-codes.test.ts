import { afterEach, describe, expect, test } from "bun:test";
import { eq, inArray } from "drizzle-orm";
import { db } from "#server/db/index.ts";
import { linkCodes, platformIdentities } from "#server/db/schema.ts";
import { createTestUser, deleteTestUser } from "#server/db/testing.ts";
import { resolveAppUserId } from "#server/db/users.ts";
import { issueLinkCode, linkReply, parseLinkCommand, redeemLinkCode } from "./link-codes.ts";

const userIds: string[] = [];

afterEach(async () => {
  const ids = userIds.splice(0);
  await db.delete(platformIdentities).where(inArray(platformIdentities.userId, ids));
  for (const id of ids) await deleteTestUser(id);
});

async function user(): Promise<string> {
  const id = await createTestUser("Linker");
  userIds.push(id);
  return id;
}

describe("parseLinkCommand", () => {
  test("reads a code sent on its own, in any case", () => {
    expect(parseLinkCommand("link abc234")).toBe("ABC234");
    expect(parseLinkCommand("  LINK  QRS789 ")).toBe("QRS789");
  });

  test("leaves every other message to the agent", () => {
    expect(parseLinkCommand("link me to Severance")).toBeUndefined();
    expect(parseLinkCommand("please link ABC234")).toBeUndefined();
    expect(parseLinkCommand("link ABC10")).toBeUndefined();
  });
});

describe("redeemLinkCode", () => {
  test("links the account a code is sent from to whoever was given it", async () => {
    const id = await user();
    const { code } = await issueLinkCode(id, "slack");
    const slackId = crypto.randomUUID();

    const outcome = await redeemLinkCode(code, "slack", slackId, "jordan");

    expect(outcome.kind).toBe("linked");
    expect(await resolveAppUserId("slack", slackId)).toBe(id);
  });

  test("works once", async () => {
    const id = await user();
    const { code } = await issueLinkCode(id, "slack");

    await redeemLinkCode(code, "slack", crypto.randomUUID());

    expect((await redeemLinkCode(code, "slack", crypto.randomUUID())).kind).toBe("invalid");
  });

  test("works only on the platform it was made for", async () => {
    const { code } = await issueLinkCode(await user(), "slack");
    expect((await redeemLinkCode(code, "discord", crypto.randomUUID())).kind).toBe("invalid");
  });

  test("stops working once it expires", async () => {
    const id = await user();
    const { code } = await issueLinkCode(id, "discord");
    await db
      .update(linkCodes)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(linkCodes.code, code));

    expect((await redeemLinkCode(code, "discord", crypto.randomUUID())).kind).toBe("invalid");
  });

  test("is replaced by a newer code for the same platform", async () => {
    const id = await user();
    const { code: first } = await issueLinkCode(id, "slack");
    await issueLinkCode(id, "slack");

    expect((await redeemLinkCode(first, "slack", crypto.randomUUID())).kind).toBe("invalid");
  });

  test("never takes an account from someone else", async () => {
    const owner = await user();
    const claimant = await user();
    const slackId = crypto.randomUUID();
    await redeemLinkCode((await issueLinkCode(owner, "slack")).code, "slack", slackId);

    const outcome = await redeemLinkCode(
      (await issueLinkCode(claimant, "slack")).code,
      "slack",
      slackId,
    );

    expect(outcome.kind).toBe("taken");
    expect(await resolveAppUserId("slack", slackId)).toBe(owner);
  });

  test("says so when the account is already yours", async () => {
    const id = await user();
    const slackId = crypto.randomUUID();
    await redeemLinkCode((await issueLinkCode(id, "slack")).code, "slack", slackId);

    const outcome = await redeemLinkCode((await issueLinkCode(id, "slack")).code, "slack", slackId);

    expect(outcome.kind).toBe("already");
  });
});

describe("linkReply", () => {
  test("points a wrong code back to the account page", () => {
    expect(linkReply({ kind: "invalid" }, "slack")).toContain("/account");
  });

  test("points a taken account to an admin", () => {
    expect(linkReply({ kind: "taken" }, "discord")).toContain("admin");
  });
});
