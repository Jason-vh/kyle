import * as slack from "@/lib/slack/api";
import type { SlackContext } from "@/types";
import type { SlackSectionBlock } from "./types";

export function sendToolCallNotification(
	context: SlackContext,
	text: string,
	image?: string
) {
	const sectionBlock: SlackSectionBlock = {
		type: "section",
		text: {
			type: "mrkdwn",
			text: text,
		},
	};

	if (image) {
		sectionBlock.accessory = {
			type: "image",
			image_url: image,
			alt_text: text,
		};
	}

	slack.sendMessage({
		channel: context.slack_channel_id,
		thread_ts: context.slack_thread_ts,
		blocks: [sectionBlock],
	});
}
