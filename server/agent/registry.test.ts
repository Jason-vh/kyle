import { afterAll, beforeAll, expect, test } from "bun:test";
import { toolPresentation, toolsForTurn } from "./registry.ts";
import { describeToolCall } from "./tool-display.ts";
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

test("members receive the same tools as admins", async () => {
  const memberTools = (await toolsForTurn({ userId: memberId })).map((tool) => tool.name);
  const adminTools = (await toolsForTurn({ userId: adminId })).map((tool) => tool.name);
  expect(memberTools).toEqual(adminTools);
});

test("members cannot substitute another user's id", async () => {
  const tools = await toolsForTurn({ userId: memberId });
  for (const name of ["get_request_states", "get_requests_for_user", "unsubscribe_notifications"]) {
    await expect(
      tools.find((tool) => tool.name === name)!.execute({ userId: adminId }),
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
