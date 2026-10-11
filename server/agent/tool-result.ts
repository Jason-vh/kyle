import { safeJsonParse } from "#server/json.ts";
import type { ToolResult } from "./tool.ts";

/** Tool result carrying a JSON payload for the model to read. */
export function jsonResult(value: unknown): ToolResult {
  return { content: [{ type: "text", text: JSON.stringify(value) }] };
}

/** Reads back what jsonResult wrote, for the interfaces that describe a finished call. */
export function parseToolPayload(result: {
  content?: Array<{ type: string; text?: string }>;
}): unknown {
  const text = result.content?.find((c) => c.type === "text")?.text;
  return text ? safeJsonParse(text) : undefined;
}
