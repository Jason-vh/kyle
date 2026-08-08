import { describe, expect, test } from "bun:test";
import type { AssistantMessage, ToolResultMessage, UserMessage } from "@mariozechner/pi-ai";
import { buildThreadItems, type ThreadMessageRow } from "./items.ts";
import type { WebhookNotification } from "../db/webhook-notifications.ts";

const at = (seconds: number) => new Date(2026, 0, 1, 0, 0, seconds);

function userRow(text: string, seconds: number, username = "Kyle Fan"): ThreadMessageRow {
  return { msg: { role: "user", content: text } as UserMessage, createdAt: at(seconds), username };
}

function assistantRow(msg: Partial<AssistantMessage>, seconds: number): ThreadMessageRow {
  return {
    msg: { role: "assistant", content: [], stopReason: "endTurn", ...msg } as AssistantMessage,
    createdAt: at(seconds),
    username: "Kyle",
  };
}

const webhook: WebhookNotification = {
  source: "sonarr",
  message: "downloaded",
  receivedAt: at(5),
  payload: { mediaType: "series", title: "Severance", year: 2022 },
} as WebhookNotification;

describe("buildThreadItems", () => {
  test("orders messages and webhooks by time", () => {
    const items = buildThreadItems(
      [userRow("hi", 0), assistantRow({ content: [{ type: "text", text: "hello" }] }, 10)],
      [webhook],
    );

    expect(items.map((i) => i.kind)).toEqual(["message", "webhook", "message"]);
    expect(items[0]).toMatchObject({ message: { username: "Kyle Fan", textContent: "hi" } });
    expect(items[2]).toMatchObject({ message: { username: "Kyle", textContent: "hello" } });
  });

  test("folds tool results into the calls that produced them", () => {
    const toolResult: ToolResultMessage = {
      role: "toolResult",
      toolCallId: "call-1",
      toolName: "get_all_movies",
      content: [{ type: "text", text: '{"count":2}' }],
      isError: false,
    } as ToolResultMessage;

    const items = buildThreadItems(
      [
        assistantRow(
          {
            stopReason: "toolUse",
            content: [
              { type: "text", text: "  " },
              { type: "toolCall", id: "call-1", name: "get_all_movies", arguments: {} },
            ],
          },
          0,
        ),
        { msg: toolResult, createdAt: at(1), username: "Kyle" },
      ],
      [],
    );

    expect(items).toHaveLength(1);
    const message = items[0]!.kind === "message" ? items[0]!.message : null;
    expect(message?.textContent).toBeUndefined();
    expect(message?.hasErrors).toBe(false);
    expect(message?.toolCalls).toEqual([
      {
        id: "call-1",
        name: "get_all_movies",
        summaryText: "Checked movie library",
        arguments: {},
        result: { isError: false, text: '{\n  "count": 2\n}' },
      },
    ]);
  });

  test("flags a failed tool call", () => {
    const items = buildThreadItems(
      [
        assistantRow(
          {
            stopReason: "toolUse",
            content: [{ type: "toolCall", id: "call-1", name: "add_movie", arguments: {} }],
          },
          0,
        ),
        {
          msg: {
            role: "toolResult",
            toolCallId: "call-1",
            toolName: "add_movie",
            content: [{ type: "text", text: "boom" }],
            isError: true,
          } as ToolResultMessage,
          createdAt: at(1),
          username: "Kyle",
        },
      ],
      [],
    );

    expect(items[0]!.kind === "message" && items[0]!.message.hasErrors).toBe(true);
  });

  test("renders an API error as readable text plus the raw payload", () => {
    const items = buildThreadItems(
      [
        assistantRow(
          {
            stopReason: "error",
            errorMessage: '{"error":{"message":"overloaded"}}',
          },
          0,
        ),
      ],
      [],
    );

    const message = items[0]!.kind === "message" ? items[0]!.message : null;
    expect(message?.errorMessage).toBe("overloaded");
    expect(message?.errorRaw).toContain("overloaded");
    expect(message?.hasErrors).toBe(true);
  });
});
