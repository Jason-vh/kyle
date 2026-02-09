import { Agent, type AgentMessage } from "@mariozechner/pi-agent-core";
import { getModel, getEnvApiKey, type AssistantMessage, type TextContent } from "@mariozechner/pi-ai";
import { SYSTEM_PROMPT } from "./system-prompt.ts";
import { getAllSeriesTool } from "../sonarr/tools.ts";

export function createAgent(): Agent {
  if (!getEnvApiKey("anthropic")) {
    throw new Error("ANTHROPIC_API_KEY environment variable is required");
  }

  return new Agent({
    initialState: {
      systemPrompt: SYSTEM_PROMPT,
      model: getModel("anthropic", "claude-sonnet-4-20250514"),
      thinkingLevel: "off",
      tools: [getAllSeriesTool],
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
