import { defineDoc, type ConversationId, type Tx } from "@earendil-works/pi-durable";
import type { AgentContext } from "./system-prompt.ts";

type StoredContext = { [K in keyof AgentContext]?: string };

type StoredTurn = {
  context: StoredContext;
  author: { platformUserId?: string; appUserId?: string };
  hidePrompt: boolean;
  discordChannelId?: string;
};

/** What a conversation's current turn is, for the prompt, the tools, and finishing it after a restart. */
export interface Turn {
  context: AgentContext;
  /** Who sent it; the messages copied from it are attributed to them. */
  author: { platformUserId: string | null; appUserId: string | null };
  /** See `ConversationTurn.storePrompt`. */
  hidePrompt: boolean;
  /** Where to answer, should the turn outlive the process that took it. */
  discordChannelId?: string;
}

function withoutUndefined<T extends object>(
  value: T,
): { [K in keyof T]: Exclude<T[K], undefined> } {
  return Object.fromEntries(Object.entries(value).filter(([, field]) => field !== undefined)) as {
    [K in keyof T]: Exclude<T[K], undefined>;
  };
}

export const TurnDoc = defineDoc<StoredTurn>({
  kind: "kyle.turn-context",
  version: 2,
  scope: "conversation",
  history: "latest",
  fork: "current",
  initial: () => ({ context: {}, author: {}, hidePrompt: false }),
  // Version 1 held only the context.
  migrate: (value) => ({ context: value as StoredContext, author: {}, hidePrompt: false }),
});

export async function writeTurn(tx: Tx, conversationId: ConversationId, turn: Turn): Promise<void> {
  const draft = await tx.doc(TurnDoc, conversationId);
  draft.context = withoutUndefined(turn.context);
  draft.author = withoutUndefined({
    platformUserId: turn.author.platformUserId ?? undefined,
    appUserId: turn.author.appUserId ?? undefined,
  });
  draft.hidePrompt = turn.hidePrompt;
  if (turn.discordChannelId === undefined) delete draft.discordChannelId;
  else draft.discordChannelId = turn.discordChannelId;
}

export function readTurn(stored: Readonly<StoredTurn> | undefined): Turn {
  const { username, userId, conversationId, interfaceType, viewing } = stored?.context ?? {};
  return {
    context: {
      username,
      userId,
      conversationId,
      interfaceType: interfaceType as AgentContext["interfaceType"],
      viewing,
    },
    author: {
      platformUserId: stored?.author.platformUserId ?? null,
      appUserId: stored?.author.appUserId ?? null,
    },
    hidePrompt: stored?.hidePrompt ?? false,
    discordChannelId: stored?.discordChannelId,
  };
}
