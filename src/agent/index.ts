import { Agent, type AgentMessage } from "@mariozechner/pi-agent-core";
import { getModel, getEnvApiKey, type AssistantMessage, type TextContent } from "@mariozechner/pi-ai";
import { createLogger } from "../logger.ts";
import { getSystemPrompt } from "./system-prompt.ts";

// Sonarr tools
import {
  getAllSeriesTool,
  getSeriesByIdTool,
  searchSeriesTool,
  addSeriesTool,
  removeSeriesTool,
  removeSeasonTool,
  getEpisodesTool,
  getSeriesQueueTool,
  getCalendarTool,
  searchEpisodesTool,
  getSeriesHistoryTool,
} from "../sonarr/tools.ts";

// Radarr tools
import {
  getRadarrMovieTool,
  getAllMoviesTool,
  searchMoviesTool,
  addMovieTool,
  removeMovieTool,
  getMovieQueueTool,
  getMovieHistoryTool,
} from "../radarr/tools.ts";

// TMDB tools
import {
  searchTmdbMoviesTool,
  searchTmdbSeriesTool,
  searchTmdbTool,
  getTmdbMovieDetailsTool,
  getTmdbSeriesDetailsTool,
} from "../tmdb/tools.ts";

const log = createLogger("agent");

const allTools = [
  // Sonarr
  getAllSeriesTool,
  getSeriesByIdTool,
  searchSeriesTool,
  addSeriesTool,
  removeSeriesTool,
  removeSeasonTool,
  getEpisodesTool,
  getSeriesQueueTool,
  getCalendarTool,
  searchEpisodesTool,
  getSeriesHistoryTool,
  // Radarr
  getRadarrMovieTool,
  getAllMoviesTool,
  searchMoviesTool,
  addMovieTool,
  removeMovieTool,
  getMovieQueueTool,
  getMovieHistoryTool,
  // TMDB
  searchTmdbMoviesTool,
  searchTmdbSeriesTool,
  searchTmdbTool,
  getTmdbMovieDetailsTool,
  getTmdbSeriesDetailsTool,
];

log.info("tools registered", {
  count: allTools.length,
  tools: allTools.map((t) => t.name),
});

export function createAgent(): Agent {
  if (!getEnvApiKey("anthropic")) {
    throw new Error("ANTHROPIC_API_KEY environment variable is required");
  }

  return new Agent({
    initialState: {
      systemPrompt: getSystemPrompt(),
      model: getModel("anthropic", "claude-sonnet-4-20250514"),
      thinkingLevel: "off",
      tools: allTools,
    },
  });
}

export async function runAgent(
  message: string,
  previousMessages: AgentMessage[] = []
): Promise<{ messages: AgentMessage[]; responseText: string }> {
  const agent = createAgent();

  if (previousMessages.length > 0) {
    agent.replaceMessages(previousMessages);
  }

  await agent.prompt(message);

  const messages = agent.state.messages;

  // Extract response text from the last assistant message
  const lastAssistant = [...messages]
    .reverse()
    .find((m): m is AssistantMessage => m.role === "assistant");

  const responseText = lastAssistant
    ? lastAssistant.content
        .filter((c): c is TextContent => c.type === "text")
        .map((c) => c.text)
        .join("")
    : "";

  return { messages, responseText };
}
