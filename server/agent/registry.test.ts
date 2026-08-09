import { expect, test } from "bun:test";
import { allTools, toolPresentation, toolsForConversation } from "./registry.ts";
import { describeToolCall } from "./tool-display.ts";

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
  expect(describeToolCall("get_all_movies", {})).toBe("Checked movie library");
  expect(describeToolCall("search_episodes", { seriesId: 1 })).toBe(
    "Started downloading missing episodes",
  );
  expect(describeToolCall("long_gone_tool", {})).toBe("long gone tool");
});
