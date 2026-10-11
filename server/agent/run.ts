import {
  Agent,
  type AgentEvent,
  type AgentMessage,
  type AgentTool,
} from "@earendil-works/pi-agent-core";
import type { AssistantMessage, ImageContent, Message, TextContent } from "@earendil-works/pi-ai";
import { createLogger } from "#server/logger.ts";
import { model, models } from "./model.ts";
import { toolsForTurn } from "./registry.ts";
import { getSystemPrompt, type AgentContext } from "./system-prompt.ts";
import type { AnyTool } from "./tool.ts";

const log = createLogger("agent");

const RETRY_DELAYS = [5_000, 15_000];

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

/**
 * Stamps each user message with the time it was sent, so the model can reason
 * about pacing without the timestamps being stored in the message itself.
 */
function withTimestamps(messages: AgentMessage[], timestamps?: WeakMap<object, Date>): Message[] {
  return messages
    .filter(
      (m): m is Message =>
        m.role === "system" ||
        m.role === "user" ||
        m.role === "assistant" ||
        m.role === "toolResult",
    )
    .map((m) => {
      if (m.role !== "user") return m;
      const time = (timestamps?.get(m) ?? new Date()).toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
        timeZoneName: "short",
      });
      const prefix = `[${time}] `;
      if (typeof m.content === "string") return { ...m, content: prefix + m.content };
      return {
        ...m,
        content: m.content.map((c, i) =>
          i === 0 && c.type === "text" ? { ...c, text: prefix + c.text } : c,
        ),
      };
    });
}

function toAgentTool(tool: AnyTool): AgentTool {
  return {
    name: tool.name,
    label: tool.label,
    description: tool.description,
    parameters: tool.parameters,
    async execute(_toolCallId, args) {
      return { ...(await tool.execute(args)), details: undefined };
    },
  };
}

export async function createAgent(
  context?: AgentContext,
  previousMessages: AgentMessage[] = [],
  messageTimestamps?: WeakMap<object, Date>,
): Promise<Agent> {
  if (!(await models.getAuth(model))) {
    throw new Error("ANTHROPIC_API_KEY environment variable is required");
  }

  const tools = await toolsForTurn(context);
  return new Agent({
    initialState: {
      systemPrompt: getSystemPrompt(context),
      model,
      thinkingLevel: "off",
      tools: tools.map(toAgentTool),
      messages: previousMessages,
    },
    streamFn: models.streamSimple.bind(models),
    convertToLlm: (messages) => withTimestamps(messages, messageTimestamps),
  });
}

export interface RunAgentOptions {
  message: string;
  previousMessages?: AgentMessage[];
  context?: AgentContext;
  images?: ImageContent[];
  messageTimestamps?: WeakMap<object, Date>;
  onEvent?: (event: AgentEvent) => void;
  onRetry?: (attempt: number, maxAttempts: number) => void;
}

export interface RunAgentResult {
  messages: AgentMessage[];
  responseText: string;
}

/** Text of the last assistant reply, with any tool calls and thinking stripped out. */
function lastResponseText(messages: AgentMessage[]): string {
  const lastAssistant = [...messages]
    .reverse()
    .find((m): m is AssistantMessage => m.role === "assistant");
  if (!lastAssistant) return "";
  return lastAssistant.content
    .filter((c): c is TextContent => c.type === "text")
    .map((c) => c.text)
    .join("");
}

/** Runs one prompt to completion, retrying while the API reports it is overloaded. */
export async function runAgent(options: RunAgentOptions): Promise<RunAgentResult> {
  const { message, previousMessages = [], context, images, messageTimestamps } = options;
  const agent = await createAgent(context, previousMessages, messageTimestamps);

  if (options.onEvent) agent.subscribe(options.onEvent);

  await agent.prompt(message, images?.length ? images : undefined);

  for (let attempt = 0; attempt < RETRY_DELAYS.length; attempt++) {
    if (!isOverloadedError(agent.state.errorMessage)) break;

    log.warn("API overloaded, retrying", {
      attempt: attempt + 1,
      maxAttempts: RETRY_DELAYS.length,
      delayMs: RETRY_DELAYS[attempt],
      error: agent.state.errorMessage,
    });
    options.onRetry?.(attempt + 1, RETRY_DELAYS.length);

    // The failed attempt is already persisted; drop it so the retry starts clean.
    agent.state.messages = agent.state.messages.slice(0, -1);
    await new Promise((resolve) => setTimeout(resolve, RETRY_DELAYS[attempt]));
    await agent.continue();
  }

  if (isOverloadedError(agent.state.errorMessage)) {
    log.error("API overloaded after all retries", {
      attempts: RETRY_DELAYS.length,
      error: agent.state.errorMessage,
    });
    throw new ApiOverloadedError();
  }

  // Anything else — billing, auth, an invalid request — is not worth retrying.
  if (agent.state.errorMessage) {
    log.error("agent API error", { error: agent.state.errorMessage });
    throw new Error(agent.state.errorMessage);
  }

  return {
    messages: agent.state.messages,
    responseText: lastResponseText(agent.state.messages),
  };
}
