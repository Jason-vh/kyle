import { Agent, type AgentMessage, type AgentEvent } from "@mariozechner/pi-agent-core";
import {
  getModel,
  getEnvApiKey,
  type AssistantMessage,
  type ImageContent,
  type Message,
  type TextContent,
} from "@mariozechner/pi-ai";
import { createLogger } from "../logger.ts";
import { getSystemPrompt, type AgentContext } from "./system-prompt.ts";

export class ApiOverloadedError extends Error {
  constructor(message = "API is overloaded after retries") {
    super(message);
    this.name = "ApiOverloadedError";
  }
}

function isOverloadedError(error?: string): boolean {
  if (!error) return false;
  const lower = error.toLowerCase();
  return lower.includes("overloaded") || lower.includes("529");
}

export type { AgentContext };

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

// Ultra tools
import { getUltraStatsTool } from "../ultra/tools.ts";

// qBittorrent tools
import { getTorrentsTool, deleteTorrentsTool } from "../qbittorrent/tools.ts";

// Brave Search tools
import { webSearchTool } from "../brave/tools.ts";

// Time tools
import { convertTimeTool } from "../time/tools.ts";

// Conversation tools
import { createShareConversationTool } from "./share-tool.ts";
import { getRequestsForUserTool } from "./requests-tool.ts";
import { unsubscribeNotificationsTool } from "./unsubscribe-tool.ts";

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
  // Ultra
  getUltraStatsTool,
  // qBittorrent
  getTorrentsTool,
  deleteTorrentsTool,
  // Brave Search
  webSearchTool,
  // Time
  convertTimeTool,
  // Requests
  getRequestsForUserTool,
  // Notifications
  unsubscribeNotificationsTool,
];

export const toolLabels = new Map(allTools.map((t) => [t.name, t.label]));

log.info("tools registered", {
  count: allTools.length,
  tools: allTools.map((t) => t.name),
});

export function createAgent(
  context?: AgentContext,
  messageTimestamps?: WeakMap<object, Date>,
): Agent {
  if (!getEnvApiKey("anthropic")) {
    throw new Error("ANTHROPIC_API_KEY environment variable is required");
  }

  const tools = [...allTools];
  if (context?.conversationId) {
    const shareTool = createShareConversationTool(context.conversationId);
    tools.push(shareTool);
    toolLabels.set(shareTool.name, shareTool.label);
  }

  return new Agent({
    initialState: {
      systemPrompt: getSystemPrompt(context),
      model: getModel("anthropic", "claude-sonnet-4-20250514"),
      thinkingLevel: "off",
      tools,
    },
    convertToLlm: (messages) => {
      return messages
        .filter(
          (m): m is Message =>
            m.role === "user" || m.role === "assistant" || m.role === "toolResult",
        )
        .map((m) => {
          if (m.role !== "user") return m;
          const createdAt = messageTimestamps?.get(m) ?? new Date();
          const time = createdAt.toLocaleTimeString("en-US", {
            hour: "numeric",
            minute: "2-digit",
            timeZoneName: "short",
          });
          const prefix = `[${time}] `;
          if (typeof m.content === "string") {
            return { ...m, content: prefix + m.content };
          }
          const content = m.content.map((c, i) =>
            i === 0 && c.type === "text" ? { ...c, text: prefix + c.text } : c,
          );
          return { ...m, content };
        });
    },
  });
}

const RETRY_DELAYS = [5_000, 15_000];

export async function runAgent(
  message: string,
  previousMessages: AgentMessage[] = [],
  context?: AgentContext,
  onEvent?: (event: AgentEvent) => void,
  onRetry?: (attempt: number, maxAttempts: number) => void,
  messageTimestamps?: WeakMap<object, Date>,
  images?: ImageContent[],
): Promise<{ messages: AgentMessage[]; responseText: string; errorMessages: AgentMessage[] }> {
  const agent = createAgent(context, messageTimestamps);

  if (previousMessages.length > 0) {
    agent.replaceMessages(previousMessages);
  }

  if (onEvent) {
    agent.subscribe(onEvent);
  }

  await agent.prompt(message, images?.length ? images : undefined);

  const errorMessages: AgentMessage[] = [];

  // Retry loop for overloaded errors
  for (let attempt = 0; attempt < RETRY_DELAYS.length; attempt++) {
    if (!isOverloadedError(agent.state.error)) break;

    const errorMsg = agent.state.messages[agent.state.messages.length - 1];
    if (errorMsg) {
      errorMessages.push(errorMsg);
    }

    log.warn("API overloaded, retrying", {
      attempt: attempt + 1,
      maxAttempts: RETRY_DELAYS.length,
      delayMs: RETRY_DELAYS[attempt],
      error: agent.state.error,
    });

    onRetry?.(attempt + 1, RETRY_DELAYS.length);

    // Remove the error message from agent state
    agent.replaceMessages(agent.state.messages.slice(0, -1));

    await new Promise((resolve) => setTimeout(resolve, RETRY_DELAYS[attempt]));
    await agent.continue();
  }

  // If still overloaded after all retries, save the final error and throw
  if (isOverloadedError(agent.state.error)) {
    const errorMsg = agent.state.messages[agent.state.messages.length - 1];
    if (errorMsg) {
      errorMessages.push(errorMsg);
    }
    log.error("API overloaded after all retries", {
      attempts: RETRY_DELAYS.length,
      error: agent.state.error,
    });
    throw new ApiOverloadedError();
  }

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

  return { messages, responseText, errorMessages };
}
