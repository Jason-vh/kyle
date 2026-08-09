import type { AgentToolResult } from "@mariozechner/pi-agent-core";
import { safeJsonParse } from "../json.ts";

/** Tool result carrying a JSON payload for the model to read. */
export function jsonResult(value: unknown): AgentToolResult<undefined> {
  return { content: [{ type: "text", text: JSON.stringify(value) }], details: undefined };
}

/** Reads back what jsonResult wrote, for the interfaces that describe a finished call. */
export function parseToolPayload(result: {
  content?: Array<{ type: string; text?: string }>;
}): unknown {
  const text = result.content?.find((c) => c.type === "text")?.text;
  return text ? safeJsonParse(text) : undefined;
}
