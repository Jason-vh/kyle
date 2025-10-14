import * as slack from "@/lib/slack/api";
import type { SlackContext } from "@/types";
import type { SlackContextBlock, SlackSectionBlock } from "./types";

export function sendMediaNotification(
	context: SlackContext,
	{
		title,
		description,
		image,
	}: {
		title: string;
		description: string;
		image?: string;
	}
) {
	const sectionBlock: SlackSectionBlock = {
		type: "section",
		text: {
			type: "mrkdwn",
			text: title,
		},
	} satisfies SlackSectionBlock;

	if (description) {
		sectionBlock.text!.text += `\n_${description}_`;
	}

	if (image) {
		sectionBlock.accessory = {
			type: "image",
			image_url: image,
			alt_text: title,
		};
	}

	slack.sendMessage({
		channel: context.slack_channel_id,
		thread_ts: context.slack_thread_ts,
		blocks: [sectionBlock],
	});
}

export function sendSystemMessage(context: SlackContext, text: string) {
	const contextBlock: SlackContextBlock = {
		type: "context",
		elements: [
			{
				type: "mrkdwn",
				text: `System: ${text}`,
			},
		],
	};

	slack.sendMessage({
		channel: context.slack_channel_id,
		thread_ts: context.slack_thread_ts,
		blocks: [contextBlock],
	});
}
