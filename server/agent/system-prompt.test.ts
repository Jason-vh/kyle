import { expect, test } from "bun:test";
import { getSystemPrompt } from "./system-prompt.ts";

test("what the user is viewing reaches the prompt", () => {
  const prompt = getSystemPrompt({ username: "Jason", viewing: "the #movies channel" });
  expect(prompt).toContain("chatting with Jason");
  expect(prompt).toContain("currently looking at the #movies channel");
});

test("prompt stays clean without user context", () => {
  const prompt = getSystemPrompt({});
  expect(prompt).not.toContain("currently looking at");
  expect(prompt).not.toContain("{USER_CONTEXT}");
});
