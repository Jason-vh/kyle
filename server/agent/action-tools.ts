/** Tools that change something, as opposed to looking something up. */
const ACTION_TOOLS = new Set([
  "add_movie",
  "remove_movie",
  "add_series",
  "remove_series",
  "remove_season",
  "download_episodes",
  "delete_torrents",
  "unsubscribe_notifications",
]);

/**
 * Whether a tool call is worth surfacing in the UI.
 *
 * Lookups run constantly and say nothing useful, so only actions are shown.
 * `manual_import` both lists and imports, depending on its arguments.
 */
export function isActionTool(toolName: string, args?: Record<string, unknown>): boolean {
  if (toolName === "manual_import") return args?.importAll === true;
  return ACTION_TOOLS.has(toolName);
}
