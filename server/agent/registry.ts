import { createLogger } from "../logger.ts";
import { braveTools } from "../brave/tools.ts";
import { qbittorrentTools } from "../qbittorrent/tools.ts";
import { radarrTools } from "../radarr/tools.ts";
import { sonarrTools } from "../sonarr/tools.ts";
import { timeTools } from "../time/tools.ts";
import { tmdbTools } from "../tmdb/tools.ts";
import { ultraTools } from "../ultra/tools.ts";
import { getRequestsForUserTool } from "./requests-tool.ts";
import { createShareConversationTool, shareConversationPresentation } from "./share-tool.ts";
import { unsubscribeNotificationsTool } from "./unsubscribe-tool.ts";
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

/** The one place a tool name maps back to how it should be described. */
const presentationByName = new Map<string, ToolPresentation>(
  [...allTools, shareConversationPresentation].map((tool) => [tool.name, tool]),
);

log.info("tools registered", {
  count: presentationByName.size,
  tools: [...presentationByName.keys()],
});

export function toolPresentation(name: string): ToolPresentation | undefined {
  return presentationByName.get(name);
}

/** The turn's tools, including the share tool once there is a conversation to share. */
export function toolsForConversation(conversationId?: string): AnyTool[] {
  return conversationId ? [...allTools, createShareConversationTool(conversationId)] : allTools;
}
