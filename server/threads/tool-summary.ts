import type { ToolCall } from "@mariozechner/pi-ai";
import { toolPresentation } from "../agent/registry.ts";

/** Tools that have since been renamed, so old threads still read correctly. */
const RENAMED = new Map([["search_episodes", "download_episodes"]]);

/** One-line, past-tense description of a tool call for the thread viewer. */
export function toolSummary(toolCall: ToolCall): string {
  const name = RENAMED.get(toolCall.name) ?? toolCall.name;
  const summary = toolPresentation(name)?.summary;
  if (!summary) return name.replace(/_/g, " ");
  return typeof summary === "string"
    ? summary
    : summary(toolCall.arguments as Record<string, unknown>);
}
