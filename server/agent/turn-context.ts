import { defineDoc, type ConversationId, type Tx } from "@earendil-works/pi-durable";
import type { AgentContext } from "./system-prompt.ts";

type StoredContext = { [K in keyof AgentContext]?: string };

/** Who the conversation's current turn is for; the prompt and the tools read it. */
export const TurnContextDoc = defineDoc<StoredContext>({
  kind: "kyle.turn-context",
  version: 1,
  scope: "conversation",
  history: "latest",
  fork: "current",
  initial: () => ({}),
});

export async function writeTurnContext(
  tx: Tx,
  conversationId: ConversationId,
  context: AgentContext,
): Promise<void> {
  const draft = await tx.doc(TurnContextDoc, conversationId);
  for (const key of Object.keys(draft) as (keyof AgentContext)[]) delete draft[key];
  for (const [key, value] of Object.entries(context) as [keyof AgentContext, string?][]) {
    if (value !== undefined) draft[key] = value;
  }
}

export function readTurnContext(stored: Readonly<StoredContext> | undefined): AgentContext {
  if (!stored) return {};
  const { interfaceType, ...rest } = stored;
  return { ...rest, interfaceType: interfaceType as AgentContext["interfaceType"] };
}
