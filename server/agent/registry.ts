import { createLogger } from "#server/logger.ts";
import { getActiveUser } from "#server/auth/account.ts";
import { braveTools } from "#server/brave/tools.ts";
import { qbittorrentTools } from "#server/qbittorrent/tools.ts";
import { sabnzbdTools } from "#server/sabnzbd/tools.ts";
import { createAddMovieTool, radarrTools } from "#server/radarr/tools.ts";
import { createAddSeriesTool, createRequestSeasonTool, sonarrTools } from "#server/sonarr/tools.ts";
import { timeTools } from "#server/time/tools.ts";
import { tmdbTools } from "#server/tmdb/tools.ts";
import { ultraTools } from "#server/ultra/tools.ts";
import { getRequestStatesTool, getRequestsForUserTool } from "./requests-tool.ts";
import { unsubscribeNotificationsTool } from "./unsubscribe-tool.ts";
import type { AgentContext } from "./system-prompt.ts";
import type { AnyTool, ToolPresentation } from "./tool.ts";

const log = createLogger("agent:registry");

/** Every tool offered on every turn. */
const allTools: AnyTool[] = [
  ...sonarrTools,
  ...radarrTools,
  ...tmdbTools,
  ...ultraTools,
  ...qbittorrentTools,
  ...sabnzbdTools,
  ...braveTools,
  ...timeTools,
  getRequestsForUserTool,
  getRequestStatesTool,
  unsubscribeNotificationsTool,
];

/**
 * Every tool there is, those bound to a requester included. Their schemas and
 * presentation do not depend on the requester; running one goes through
 * `toolsForTurn`, which binds it.
 */
export const toolCatalog: AnyTool[] = [
  ...allTools,
  createAddMovieTool(),
  createAddSeriesTool(),
  createRequestSeasonTool(),
];

/** The one place a tool name maps back to how it should be described. */
const presentationByName = new Map<string, ToolPresentation>(
  toolCatalog.map((tool) => [tool.name, tool]),
);

log.info("tools registered", {
  count: presentationByName.size,
  tools: [...presentationByName.keys()],
});

export function toolPresentation(name: string): ToolPresentation | undefined {
  return presentationByName.get(name);
}

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
  ].map(
    (tool): AnyTool => ({
      ...tool,
      async execute(args) {
        const { userId } = args as { userId?: unknown };
        if (typeof userId === "string" && userId !== user.id && !user.isAdmin) {
          throw new Error("You can only manage your own requests and subscriptions");
        }
        return tool.execute(args);
      },
    }),
  );
}
