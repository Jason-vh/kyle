import * as slack from "@/lib/slack/api";
import type { SlackContext } from "@/types";

export function sendToolCallNotification(context: SlackContext, text: string) {
	slack.sendMessage({
		channel: context.slack_channel_id,
		thread_ts: context.slack_thread_ts,
		blocks: [
			{
				type: "context",
				elements: [
					{
						type: "plain_text",
						text,
					},
				],
			},
		],
	});
}
