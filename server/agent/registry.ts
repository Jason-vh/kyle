import { createLogger } from "#server/logger.ts";
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

/** The turn's tools, with adding attributed to the user it is running for. */
export function toolsForTurn(context?: AgentContext): AnyTool[] {
  const requestedBy = context?.userId
    ? { userId: context.userId, conversationId: context.conversationId }
    : undefined;

  return [
    ...allTools,
    createAddMovieTool(requestedBy),
    createAddSeriesTool(requestedBy),
    createRequestSeasonTool(requestedBy),
  ];
}
