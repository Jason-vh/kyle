import { createLogger } from "../logger.ts";
import { braveTools } from "../brave/tools.ts";
import { qbittorrentTools } from "../qbittorrent/tools.ts";
import { addMoviePresentation, createAddMovieTool, radarrTools } from "../radarr/tools.ts";
import { addSeriesPresentation, createAddSeriesTool, sonarrTools } from "../sonarr/tools.ts";
import { timeTools } from "../time/tools.ts";
import { tmdbTools } from "../tmdb/tools.ts";
import { ultraTools } from "../ultra/tools.ts";
import { getRequestsForUserTool } from "./requests-tool.ts";
import { createShareConversationTool, shareConversationPresentation } from "./share-tool.ts";
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
  unsubscribeNotificationsTool,
];

/** Tools built per turn, so only their presentation can live in the registry. */
const contextualPresentations: ToolPresentation[] = [
  shareConversationPresentation,
  addMoviePresentation,
  addSeriesPresentation,
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

/**
 * The turn's tools. Adding attributes to the user it is running for, and the
 * share tool appears once there is a conversation to share.
 */
export function toolsForTurn(context?: AgentContext): AnyTool[] {
  const requestedBy = context?.userId
    ? { userId: context.userId, conversationId: context.conversationId }
    : undefined;

  const tools = [...allTools, createAddMovieTool(requestedBy), createAddSeriesTool(requestedBy)];
  if (context?.conversationId) tools.push(createShareConversationTool(context.conversationId));
  return tools;
}
