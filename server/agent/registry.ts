import { createLogger } from "#server/logger.ts";
import { getActiveUser } from "#server/auth/account.ts";
import { braveTools } from "#server/brave/tools.ts";
import { qbittorrentTools } from "#server/qbittorrent/tools.ts";
import { addMoviePresentation, createAddMovieTool, radarrTools } from "#server/radarr/tools.ts";
import {
  addSeriesPresentation,
  createAddSeriesTool,
  createRequestSeasonTool,
  requestSeasonPresentation,
  sonarrTools,
} from "#server/sonarr/tools.ts";
import { timeTools } from "#server/time/tools.ts";
import { tmdbTools } from "#server/tmdb/tools.ts";
import { ultraTools } from "#server/ultra/tools.ts";
import { getRequestStatesTool, getRequestsForUserTool } from "./requests-tool.ts";
import { unsubscribeNotificationsTool } from "./unsubscribe-tool.ts";
import type { AgentContext } from "./system-prompt.ts";
import type { AnyTool, ToolPresentation } from "./tool.ts";

const log = createLogger("agent:registry");

/** Every tool offered on every turn. */
export const allTools: AnyTool[] = [
  ...sonarrTools,
  ...radarrTools,
  ...tmdbTools,
  ...ultraTools,
  ...qbittorrentTools,
  ...braveTools,
  ...timeTools,
  getRequestsForUserTool,
  getRequestStatesTool,
  unsubscribeNotificationsTool,
];

/** Tools built per turn, so only their presentation can live in the registry. */
const contextualPresentations: ToolPresentation[] = [
  addMoviePresentation,
  addSeriesPresentation,
  requestSeasonPresentation,
];

/** The one place a tool name maps back to how it should be described. */
const presentationByName = new Map<string, ToolPresentation>(
  [...allTools, ...contextualPresentations].map((tool) => [tool.name, tool]),
);

log.info("tools registered", {
  count: presentationByName.size,
  tools: [...presentationByName.keys()],
});

export function toolPresentation(name: string): ToolPresentation | undefined {
  return presentationByName.get(name);
}

const MEMBER_TOOLS = new Set([
  "get_all_series",
  "get_series_by_id",
  "search_series",
  "get_episodes",
  "get_series_queue",
  "get_calendar",
  "get_radarr_movie",
  "get_all_movies",
  "search_movies",
  "get_movie_queue",
  "search_tmdb_movies",
  "search_tmdb_series",
  "search_tmdb",
  "get_tmdb_movie_details",
  "get_tmdb_series_details",
  "web_search",
  "convert_time",
  "get_requests_for_user",
  "get_request_states",
  "unsubscribe_notifications",
  "add_movie",
  "add_series",
  "request_season",
]);

export async function toolsForTurn(context?: AgentContext): Promise<AnyTool[]> {
  if (!context?.userId) return [];
  const user = await getActiveUser(context.userId);
  if (!user) return [];
  const requestedBy = { userId: user.id, conversationId: context.conversationId };

  return [
    ...allTools,
    createAddMovieTool(requestedBy),
    createAddSeriesTool(requestedBy),
    createRequestSeasonTool(requestedBy),
  ]
    .filter((tool) => user.isAdmin || MEMBER_TOOLS.has(tool.name))
    .map((tool) => ({
      ...tool,
      async execute(toolCallId, args, signal, onUpdate) {
        const current = await getActiveUser(user.id);
        if (!current || (!current.isAdmin && !MEMBER_TOOLS.has(tool.name))) {
          throw new Error("You are not authorized to use this tool");
        }
        if (typeof args.userId === "string" && args.userId !== current.id && !current.isAdmin) {
          throw new Error("You can only manage your own requests and subscriptions");
        }
        return tool.execute(toolCallId, args, signal, onUpdate);
      },
    }));
}
