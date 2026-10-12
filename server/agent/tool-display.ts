import { isObject } from "#server/http/input.ts";
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

/** What the tool itself said happened: the error it failed with, or its result's `message`. */
export function toolOutcome(
  result: { isError: boolean; content: Array<{ type: string; text?: string }> },
  payload?: unknown,
): string | undefined {
  if (result.isError) return result.content.find((block) => block.type === "text")?.text;
  if (isObject(payload) && typeof payload.message === "string") return payload.message;
  return undefined;
}
