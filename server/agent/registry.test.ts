import { expect, test } from "bun:test";
import { toolPresentation, toolsForTurn } from "./registry.ts";
import { describeToolCall } from "./tool-display.ts";

const everyTool = toolsForTurn({ conversationId: "conv-1", userId: "user-1" });

test("tool names are unique", () => {
  const names = everyTool.map((t) => t.name);
  expect(new Set(names).size).toBe(names.length);
});

test("every tool describes itself for the thread viewer", () => {
  for (const tool of everyTool) {
    expect(tool.label).toBeTruthy();
    expect(tool.summary).toBeDefined();
    expect(toolPresentation(tool.name)).toBeDefined();
  }
});

test("the share tool is offered only when there is a conversation to share", () => {
  expect(toolsForTurn().map((t) => t.name)).not.toContain("share_conversation");
  expect(everyTool.map((t) => t.name)).toContain("share_conversation");
  // Its presentation is always known, so old threads still render.
  expect(toolPresentation("share_conversation")?.label).toBe("Generating share link");
});

test("adding is offered even when nobody can be attributed", () => {
  const names = toolsForTurn().map((t) => t.name);
  expect(names).toContain("add_movie");
  expect(names).toContain("add_series");
});

test("summaries read in the past tense, including for renamed tools", () => {
  expect(describeToolCall("get_all_movies", {})).toBe("Checked movie library");
  expect(describeToolCall("search_episodes", { seriesId: 1 })).toBe(
    "Started downloading missing episodes",
  );
  expect(describeToolCall("long_gone_tool", {})).toBe("long gone tool");
});
