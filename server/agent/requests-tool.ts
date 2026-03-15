import { Type } from "@sinclair/typebox";
import type { AgentTool } from "@mariozechner/pi-agent-core";
import { getSubscriptionsForUser } from "../db/subscriptions.ts";

const params = Type.Object({
  userId: Type.String({
    description: "The app user ID (UUID) to look up subscriptions for",
  }),
});

export const getRequestsForUserTool: AgentTool<typeof params> = {
  name: "get_requests_for_user",
  description:
    "Get all media subscriptions for a specific user. Returns movies and series the user has requested, with their notification subscription status (active/inactive). The userId parameter is the app user UUID shown in conversation context.",
  parameters: params,
  label: "Looking up user subscriptions",
  async execute(_toolCallId, params) {
    const subscriptions = await getSubscriptionsForUser(params.userId);
    return {
      content: [{ type: "text", text: JSON.stringify(subscriptions) }],
      details: undefined,
    };
  },
};
