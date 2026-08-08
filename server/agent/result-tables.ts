import { safeJsonParse } from "../json.ts";
import { toolPresentation } from "./registry.ts";
import type { ResultTable } from "./table.ts";

export type { ResultTable };

/** Renders a tool result as a table, for the tools that declare one. */
export function extractTable(
  toolName: string,
  result: { content?: Array<{ type: string; text?: string }> },
): ResultTable | undefined {
  const table = toolPresentation(toolName)?.table;
  if (!table) return undefined;

  const text = result.content?.find((c) => c.type === "text")?.text;
  const payload = text ? safeJsonParse(text) : undefined;
  return payload === undefined ? undefined : table(payload);
}
