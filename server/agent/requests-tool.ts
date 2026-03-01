import { Type } from "@sinclair/typebox";
import type { AgentTool } from "@mariozechner/pi-agent-core";
import { getRequestsForUser } from "../db/media-refs.ts";

const params = Type.Object({
  userId: Type.String({
    description: "The app user ID (UUID) to look up requests for",
  }),
});

export const getRequestsForUserTool: AgentTool<typeof params> = {
  name: "get_requests_for_user",
  description:
    "Get all media add/remove requests made by a specific user. Returns a chronological list of actions (add, remove) with media titles and IDs. The userId parameter is the app user UUID shown in conversation context.",
  parameters: params,
  label: "Looking up user requests",
  async execute(_toolCallId, params) {
    const requests = await getRequestsForUser(params.userId);
    return {
      content: [{ type: "text", text: JSON.stringify(requests) }],
      details: undefined,
    };
  },
};
