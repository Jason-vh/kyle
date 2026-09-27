import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { inArray } from "drizzle-orm";
import {
  handleCreateLinkCode,
  handleDeleteAccountLink,
  handleGetAccountLinks,
} from "./account-links.ts";
import { buildJwtCookie, signJwt } from "#server/auth/jwt.ts";
import { createTestUser, deleteTestUser } from "#server/db/testing.ts";
import { db } from "#server/db/index.ts";
import { platformIdentities } from "#server/db/schema.ts";
import type { AccountLinks } from "#shared/types.ts";

process.env.JWT_SECRET = "test-secret-that-is-long-enough-for-hs256";
const previousSlackToken = process.env.SLACK_BOT_TOKEN;
process.env.SLACK_BOT_TOKEN = "xoxb-test";

let meId = "";
let otherId = "";
let asMe = "";
let mySlack = "";
let theirSlack = "";

beforeAll(async () => {
  meId = await createTestUser("Links Me");
  otherId = await createTestUser("Links Other");
  asMe = buildJwtCookie(await signJwt({ id: meId, name: "Me", admin: false }), true).split(";")[0]!;
  const [mine, theirs] = await db
    .insert(platformIdentities)
    .values([
      { userId: meId, platform: "slack", platformUserId: crypto.randomUUID() },
      { userId: otherId, platform: "slack", platformUserId: crypto.randomUUID() },
    ])
    .returning();
  mySlack = mine!.id;
  theirSlack = theirs!.id;
});

afterAll(async () => {
  if (previousSlackToken === undefined) delete process.env.SLACK_BOT_TOKEN;
  else process.env.SLACK_BOT_TOKEN = previousSlackToken;
  await db.delete(platformIdentities).where(inArray(platformIdentities.userId, [meId, otherId]));
  await deleteTestUser(meId);
  await deleteTestUser(otherId);
});

function request(path: string, method: string): Request {
  return new Request(`http://localhost${path}`, { method, headers: { Cookie: asMe } });
}

describe("your linked accounts", () => {
  test("lists only your own, and what can be linked", async () => {
    const response = await handleGetAccountLinks(request("/api/account/links", "GET"));
    const links = (await response.json()) as AccountLinks;

    expect(links.identities.map((identity) => identity.id)).toEqual([mySlack]);
    expect(links.platforms).toContain("slack");
  });

  test("hands out a code for a platform Kyle is on, and nothing for others", async () => {
    const slack = await handleCreateLinkCode(
      request("/api/account/links/slack/code", "POST"),
      "slack",
    );
    expect(((await slack.json()) as { code: string }).code).toHaveLength(6);

    const plex = await handleCreateLinkCode(
      request("/api/account/links/plex/code", "POST"),
      "plex",
    );
    expect(plex.status).toBe(404);
  });

  test("unlinks only what is yours", async () => {
    const theirs = request(`/api/account/links/${theirSlack}`, "DELETE");
    expect((await handleDeleteAccountLink(theirs, theirSlack)).status).toBe(404);

    const mine = request(`/api/account/links/${mySlack}`, "DELETE");
    expect((await handleDeleteAccountLink(mine, mySlack)).status).toBe(200);
  });
});
