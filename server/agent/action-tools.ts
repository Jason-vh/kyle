/**
 * Tools that change something, mapped to how the finished action reads.
 *
 * Tool labels are written in the present tense for the ephemeral thread status
 * ("Removing movie from Radarr"), but a task card sticks around after the work
 * is done, so it needs a past-tense title once complete.
 */
const ACTION_TOOLS = new Map([
  ["add_movie", "Added movie to Radarr"],
  ["remove_movie", "Removed movie from Radarr"],
  ["add_series", "Added series to Sonarr"],
  ["remove_series", "Removed series from Sonarr"],
  ["remove_season", "Removed season from Sonarr"],
  ["download_episodes", "Started episode download"],
  ["delete_torrents", "Deleted torrents from qBittorrent"],
  ["unsubscribe_notifications", "Unsubscribed from notifications"],
  ["manual_import", "Imported files into Sonarr"],
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

/** Past-tense title for a finished action. */
export function completedActionLabel(toolName: string): string | undefined {
  return ACTION_TOOLS.get(toolName);
}
