import type { AgentToolResult } from "@mariozechner/pi-agent-core";

/** Tool result carrying a JSON payload for the model to read. */
export function jsonResult(value: unknown): AgentToolResult<undefined> {
  return { content: [{ type: "text", text: JSON.stringify(value) }], details: undefined };
}
