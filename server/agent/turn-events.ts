import type { AssistantMessage, Message, ToolResultMessage } from "@earendil-works/pi-ai";
import type { AgentEvent } from "@earendil-works/pi-durable";

/** What the interfaces show of a turn while it runs. */
export type TurnEvent =
  | { type: "assistant_start" }
  | { type: "text_delta"; delta: string }
  | { type: "tool_start"; toolCallId: string; toolName: string; args: Record<string, unknown> }
  | {
      type: "tool_end";
      toolCallId: string;
      toolName: string;
      isError: boolean;
      content: ToolResultMessage["content"];
    };

function assistantText(message: Message | undefined): string {
  if (message?.role !== "assistant") return "";
  return (message as AssistantMessage).content
    .flatMap((block) => (block.type === "text" ? [block.text] : []))
    .join("");
}

/**
 * Translates pi-durable's experimental agent events, so only this file follows
 * their changes. Partial answers are committed at intervals, so the deltas seen
 * may stop short of the answer; the rest is sent when the answer is complete.
 */
export function createTurnEventTranslator(): (event: AgentEvent) => TurnEvent[] {
  let streamed = "";

  function textSoFar(text: string): TurnEvent[] {
    if (!text.startsWith(streamed) || text.length === streamed.length) return [];
    const delta = text.slice(streamed.length);
    streamed = text;
    return [{ type: "text_delta", delta }];
  }

  return (event) => {
    switch (event.type) {
      case "message_start":
        if (event.message.role !== "assistant") return [];
        streamed = "";
        return [{ type: "assistant_start" }, ...textSoFar(assistantText(event.message))];
      case "message_update":
        return event.changes.flatMap((change) =>
          change.type === "text_delta" ? textSoFar(streamed + change.delta) : [],
        );
      case "message_end":
        return textSoFar(assistantText(event.entry.model?.[0]));
      case "tool_execution_start":
        return [
          {
            type: "tool_start",
            toolCallId: event.toolCallId,
            toolName: event.toolName,
            args: event.args,
          },
        ];
      case "tool_execution_end": {
        const result = event.entry?.model?.[0] as ToolResultMessage | undefined;
        return [
          {
            type: "tool_end",
            toolCallId: event.toolCallId,
            toolName: event.toolName,
            isError: result?.isError ?? true,
            content: result?.content ?? [],
          },
        ];
      }
      default:
        return [];
    }
  };
}
