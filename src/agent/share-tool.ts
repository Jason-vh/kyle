import { Type } from "@sinclair/typebox";
import type { AgentTool } from "@mariozechner/pi-agent-core";
import { signThreadSig } from "../routes/threads-auth.ts";

const BASE_URL = "https://kyle.vhtm.eu";

const emptyParams = Type.Object({});

export function createShareConversationTool(threadTs: string): AgentTool<typeof emptyParams> {
  return {
    name: "share_conversation",
    description: "Generate a shareable link to this conversation's thread viewer",
    parameters: emptyParams,
    label: "Generating share link",
    async execute() {
      const sig = await signThreadSig(threadTs);
      const url = `${BASE_URL}/threads/${threadTs}?sig=${sig}`;
      return {
        content: [{ type: "text", text: JSON.stringify({ url }) }],
        details: undefined,
      };
    },
  };
}
