import { Agent, type AgentEvent, type AgentMessage } from "@mariozechner/pi-agent-core";
import {
  getEnvApiKey,
  type AssistantMessage,
  type ImageContent,
  type Message,
  type TextContent,
} from "@mariozechner/pi-ai";
import { createLogger } from "../logger.ts";
import { model } from "./model.ts";
import { toolsForConversation } from "./registry.ts";
import { getSystemPrompt, type AgentContext } from "./system-prompt.ts";

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
      (m): m is Message => m.role === "user" || m.role === "assistant" || m.role === "toolResult",
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

export function createAgent(
  context?: AgentContext,
  messageTimestamps?: WeakMap<object, Date>,
): Agent {
  if (!getEnvApiKey("anthropic")) {
    throw new Error("ANTHROPIC_API_KEY environment variable is required");
  }

  return new Agent({
    initialState: {
      systemPrompt: getSystemPrompt(context),
      model,
      thinkingLevel: "off",
      tools: toolsForConversation(context?.conversationId),
    },
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
  errorMessages: AgentMessage[];
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
  const agent = createAgent(context, messageTimestamps);

  if (previousMessages.length > 0) agent.replaceMessages(previousMessages);
  if (options.onEvent) agent.subscribe(options.onEvent);

  await agent.prompt(message, images?.length ? images : undefined);

  // Failed attempts are kept so the thread viewer can show what happened.
  const errorMessages: AgentMessage[] = [];
  const keepLastMessage = () => {
    const last = agent.state.messages[agent.state.messages.length - 1];
    if (last) errorMessages.push(last);
  };

  for (let attempt = 0; attempt < RETRY_DELAYS.length; attempt++) {
    if (!isOverloadedError(agent.state.error)) break;
    keepLastMessage();

    log.warn("API overloaded, retrying", {
      attempt: attempt + 1,
      maxAttempts: RETRY_DELAYS.length,
      delayMs: RETRY_DELAYS[attempt],
      error: agent.state.error,
    });
    options.onRetry?.(attempt + 1, RETRY_DELAYS.length);

    agent.replaceMessages(agent.state.messages.slice(0, -1));
    await new Promise((resolve) => setTimeout(resolve, RETRY_DELAYS[attempt]));
    await agent.continue();
  }

  if (isOverloadedError(agent.state.error)) {
    keepLastMessage();
    log.error("API overloaded after all retries", {
      attempts: RETRY_DELAYS.length,
      error: agent.state.error,
    });
    throw new ApiOverloadedError();
  }

  // Anything else — billing, auth, an invalid request — is not worth retrying.
  if (agent.state.error) {
    log.error("agent API error", { error: agent.state.error });
    throw new Error(agent.state.error);
  }

  return {
    messages: agent.state.messages,
    responseText: lastResponseText(agent.state.messages),
    errorMessages,
  };
}
