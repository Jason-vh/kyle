import { toolPresentation } from "./registry.ts";

/** Tools that have since been renamed, so old threads still read correctly. */
const RENAMED = new Map([["search_episodes", "download_episodes"]]);

/**
 * Whether a tool call is worth surfacing in the UI.
 *
 * Lookups run constantly and say nothing useful, so only tools that change
 * something get a task card.
 */
export function isActionTool(toolName: string, args?: Record<string, unknown>): boolean {
  const action = toolPresentation(toolName)?.action;
  return typeof action === "function" ? action(args ?? {}) : !!action;
}

/**
 * One-line, past-tense description of a finished tool call.
 *
 * The payload is the tool's JSON result; pass it whenever it is available, since
 * that is where the name of the thing acted on usually lives.
 */
export function describeToolCall(
  toolName: string,
  args: Record<string, unknown>,
  payload?: unknown,
): string {
  const name = RENAMED.get(toolName) ?? toolName;
  const summary = toolPresentation(name)?.summary;
  if (!summary) return name.replace(/_/g, " ");
  return typeof summary === "string" ? summary : summary(args, payload);
}
