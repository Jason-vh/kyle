import type { ImageContent, Message, TextContent } from "@earendil-works/pi-ai";
import {
  defineExtension,
  defineTool,
  GenerationTask,
  hook,
  section,
  type ToolRegistration,
} from "@earendil-works/pi-durable";
import { toolCatalog, toolsForTurn } from "./registry.ts";
import { getSystemPrompt } from "./system-prompt.ts";
import type { AnyTool } from "./tool.ts";
import { readTurnContext, TurnContextDoc } from "./turn-context.ts";

/**
 * Registers a tool under its own name and schema, and runs whichever version the
 * turn's user may use, so permissions and the requester are settled at call time.
 */
function turnBoundTool(template: AnyTool): ToolRegistration {
  return defineTool({
    name: template.name,
    description: template.description,
    parameters: template.parameters,
    // Lookups change nothing, so a run interrupted mid-call may repeat them.
    replay: template.action === undefined ? "safe" : "unsafe",
    async execute(args, api, context) {
      const turn = readTurnContext(await api.snapshot(TurnContextDoc, api.conversationId, context));
      const tool = (await toolsForTurn(turn)).find((candidate) => candidate.name === template.name);
      if (!tool) throw new Error("You are not authorized to use this tool");
      return tool.execute(args);
    },
  });
}

export const turnTools = new Map(toolCatalog.map((tool) => [tool.name, turnBoundTool(tool)]));

function stampTime(message: Message): Message {
  if (message.role !== "user") return message;
  const time = new Date(message.timestamp).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
  const prefix = `[${time}] `;
  if (typeof message.content === "string") return { ...message, content: prefix + message.content };
  return {
    ...message,
    content: message.content.map((block, index) =>
      index === 0 && block.type === "text" ? { ...block, text: prefix + block.text } : block,
    ),
  };
}

/** Earlier images would be resent with every request, so only the newest message keeps its own. */
function withoutImages(message: Message): Message {
  if (message.role !== "user" || typeof message.content === "string") return message;
  if (!message.content.some((block) => block.type === "image")) return message;
  return {
    ...message,
    content: message.content.map((block): TextContent | ImageContent =>
      block.type === "image" ? { type: "text", text: "[image]" } : block,
    ),
  };
}

function prepareMessages(messages: readonly Message[]): Message[] {
  const newestUser = messages.findLastIndex((message) => message.role === "user");
  return messages.map((message, index) =>
    stampTime(index === newestUser ? message : withoutImages(message)),
  );
}

export const KyleExtension = defineExtension({
  name: "kyle",
  tools: [...turnTools.values()],
  sections: [
    section(
      "kyle",
      async (input, context) =>
        getSystemPrompt(
          readTurnContext(await input.read.snapshot(TurnContextDoc, input.conversationId, context)),
        ),
      { tag: false },
    ),
  ],
  hooks: [
    hook(GenerationTask, {
      beforeRequest: (request) => ({ messages: prepareMessages(request.messages) }),
    }),
  ],
});
