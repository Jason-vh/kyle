import { toolPresentation } from "./registry.ts";

/**
 * Whether a tool call is worth surfacing in the UI.
 *
 * Lookups run constantly and say nothing useful, so only tools that change
 * something — the ones carrying a past-tense `completedLabel` — are shown.
 */
export function isActionTool(toolName: string, args?: Record<string, unknown>): boolean {
  const tool = toolPresentation(toolName);
  if (!tool?.completedLabel) return false;
  return tool.isAction?.(args ?? {}) ?? true;
}

/**
 * Past-tense title for a finished action.
 *
 * Labels are written in the present tense for the ephemeral thread status
 * ("Removing movie from Radarr"), but a task card sticks around after the work
 * is done, so it needs a past-tense title once complete.
 */
export function completedActionLabel(toolName: string): string | undefined {
  return toolPresentation(toolName)?.completedLabel;
}
