import { Type } from "@sinclair/typebox";
import type { Tool, ToolPresentation } from "./tool.ts";
import { jsonResult } from "./tool-result.ts";
import { signThreadSig } from "../routes/threads-auth.ts";

const BASE_URL = "https://kyle.vhtm.eu";

const emptyParams = Type.Object({});

/** Bound to a conversation at call time, so the registry indexes it separately. */
export const shareConversationPresentation: ToolPresentation = {
  name: "share_conversation",
  label: "Generating share link",
  summary: "Generated share link",
};

export function createShareConversationTool(conversationId: string): Tool<typeof emptyParams> {
  return {
    ...shareConversationPresentation,
    description: "Generate a shareable link to this conversation's thread viewer",
    parameters: emptyParams,
    async execute() {
      const sig = await signThreadSig(conversationId);
      const url = `${BASE_URL}/threads/${conversationId}?sig=${sig}`;
      return jsonResult({ url });
    },
  };
}
