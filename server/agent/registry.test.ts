import { afterAll, beforeAll, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { toolPresentation, toolsForTurn } from "./registry.ts";
import { describeToolCall } from "./tool-display.ts";
import { db } from "#server/db/index.ts";
import { users } from "#server/db/schema.ts";
import { createTestUser, deleteTestUser } from "#server/db/testing.ts";

let memberId: string;
let adminId: string;
beforeAll(async () => {
  memberId = await createTestUser();
  adminId = await createTestUser("Admin", true);
});
afterAll(async () => {
  await deleteTestUser(memberId);
  await deleteTestUser(adminId);
});

test("tool names are unique and all have presentation", async () => {
  const tools = await toolsForTurn({ userId: adminId });
  expect(new Set(tools.map((tool) => tool.name)).size).toBe(tools.length);
  for (const tool of tools) {
    expect(tool.label).toBeTruthy();
    expect(tool.summary).toBeDefined();
    expect(toolPresentation(tool.name)).toBeDefined();
  }
});

test("unlinked and nonexistent users receive no tools", async () => {
  expect(await toolsForTurn()).toEqual([]);
  expect(await toolsForTurn({ userId: crypto.randomUUID() })).toEqual([]);
});

test("members can request but cannot delete, import or manage torrents", async () => {
  const names = (await toolsForTurn({ userId: memberId })).map((tool) => tool.name);
  expect(names).toContain("add_movie");
  expect(names).toContain("request_season");
  for (const name of [
    "remove_movie",
    "remove_series",
    "remove_season",
    "delete_torrents",
    "manual_import",
    "download_episodes",
  ]) {
    expect(names).not.toContain(name);
  }
});

test("permissions are checked again when a tool executes", async () => {
  const tools = await toolsForTurn({ userId: adminId });
  const remove = tools.find((tool) => tool.name === "remove_movie")!;
  await db.update(users).set({ isAdmin: false }).where(eq(users.id, adminId));
  try {
    await expect(remove.execute("call", { movieId: 1 })).rejects.toThrow("not authorized");
  } finally {
    await db.update(users).set({ isAdmin: true }).where(eq(users.id, adminId));
  }
});

test("members cannot substitute another user's id", async () => {
  const tools = await toolsForTurn({ userId: memberId });
  for (const name of ["get_request_states", "get_requests_for_user", "unsubscribe_notifications"]) {
    await expect(
      tools.find((tool) => tool.name === name)!.execute("call", { userId: adminId }),
    ).rejects.toThrow("your own");
  }
});

test("summaries read in the past tense, including for renamed tools", () => {
  expect(describeToolCall("get_all_movies", {})).toBe("Checked movie library");
  expect(describeToolCall("search_episodes", { seriesId: 1 })).toBe(
    "Started downloading missing episodes",
  );
  expect(describeToolCall("long_gone_tool", {})).toBe("long gone tool");
});
