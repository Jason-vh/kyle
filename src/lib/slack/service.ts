import * as slack from "@/lib/slack/api";
import type { SlackContext } from "@/types";
import type { SlackBlock } from "./types";

export function sendToolCallNotification(
	context: SlackContext,
	text: string,
	image?: string
) {
	const blocks: SlackBlock[] = [];

	if (image) {
		blocks.push({
			type: "image",
			image_url: image,
			alt_text: text,
		});
	}

	blocks.push({
		type: "context",
		elements: [
			{
				type: "mrkdwn",
				text: text,
			},
		],
	});

	slack.sendMessage({
		channel: context.slack_channel_id,
		thread_ts: context.slack_thread_ts,
		blocks,
	});
}
