import { toolPresentation } from "./registry.ts";
import type { ResultTable } from "./table.ts";

export type { ResultTable };

/** Renders a tool's result payload as a table, for the tools that declare one. */
export function extractTable(toolName: string, payload: unknown): ResultTable | undefined {
  if (payload === undefined) return undefined;
  return toolPresentation(toolName)?.table?.(payload);
}
