import { safeJsonParse } from "#server/json.ts";
import type { ToolResult } from "./tool.ts";

/** Tool result carrying a JSON payload for the model to read. */
export function jsonResult(value: unknown): ToolResult {
  return { content: [{ type: "text", text: JSON.stringify(value) }] };
}

/** A Markdown bullet list for a tool's details, cut short so a long one stays readable. */
export function bulletList(items: string[], max = 10): string {
  const shown = items.slice(0, max).map((item) => `- ${item}`);
  if (items.length > max) shown.push(`- and ${items.length - max} more`);
  return shown.join("\n");
}

/** Reads back what jsonResult wrote, for the interfaces that describe a finished call. */
export function parseToolPayload(result: {
  content?: Array<{ type: string; text?: string }>;
}): unknown {
  const text = result.content?.find((c) => c.type === "text")?.text;
  return text ? safeJsonParse(text) : undefined;
}
