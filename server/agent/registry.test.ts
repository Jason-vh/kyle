import { expect, test } from "bun:test";
import { allTools, toolPresentation, toolsForConversation } from "./registry.ts";
import { toolSummary } from "../threads/tool-summary.ts";

const call = (name: string, args: Record<string, unknown> = {}) =>
  ({ type: "toolCall", id: "call-1", name, arguments: args }) as const;

test("tool names are unique", () => {
  const names = allTools.map((t) => t.name);
  expect(new Set(names).size).toBe(names.length);
});

test("every tool describes itself for the thread viewer", () => {
  for (const tool of allTools) {
    expect(tool.label).toBeTruthy();
    expect(tool.summary).toBeDefined();
  }
});

test("the share tool is offered only when there is a conversation to share", () => {
  const names = (conversationId?: string) =>
    toolsForConversation(conversationId).map((t) => t.name);

  expect(names()).not.toContain("share_conversation");
  expect(names("conv-1")).toContain("share_conversation");
  // Its presentation is always known, so old threads still render.
  expect(toolPresentation("share_conversation")?.label).toBe("Generating share link");
});

test("summaries read in the past tense, including for renamed tools", () => {
  expect(toolSummary(call("get_all_movies"))).toBe("Checked movie library");
  expect(toolSummary(call("add_movie", { title: "Inception" }))).toBe(
    "Added 'Inception' to Radarr",
  );
  expect(toolSummary(call("search_episodes"))).toBe("Searched for missing episodes");
  expect(toolSummary(call("long_gone_tool"))).toBe("long gone tool");
});
