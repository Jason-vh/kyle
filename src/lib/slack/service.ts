import * as slack from "@/lib/slack/api";
import type { SlackContext } from "@/types";
import type { SlackBlock, SlackContextBlock, SlackSectionBlock } from "./types";

const STEP_TEXTS = {
	"reasoning-start": ":thinkspin: is thinking...",
};

export async function startStream(context: SlackContext) {
	const { ts } = await slack.startStream({
		channel: context.slack_channel_id,
		thread_ts: context.slack_thread_ts,
	});

	context.slack_stream_ts = ts;

	function append(text: string) {
		return slack.appendStream({
			channel: context.slack_channel_id,
			ts,
			markdown_text: text,
		});
	}

	function stop(text?: string) {
		return slack.stopStream({
			channel: context.slack_channel_id,
			ts,
			markdown_text: text,
		});
	}

	return { append, stop };
}

export function appendStepNotification(
	context: SlackContext,
	step: keyof typeof STEP_TEXTS
) {
	if (!context.slack_stream_ts) {
		return;
	}

	slack.appendStream({
		channel: context.slack_channel_id,
		ts: context.slack_stream_ts,
		markdown_text: STEP_TEXTS[step],
	});
}

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
		blocks: [
			sectionBlock,
			{
				type: "context",
				elements: [
					{
						type: "mrkdwn",
						text: `(_this is a system message indicating that an action has been taken_)`,
					},
				],
			},
		],
	});
}

export function sendMediaItems(
	context: SlackContext,
	items: {
		title: string;
		description: string;
		image?: string;
	}[]
) {
	const blocks: SlackBlock[] = [];

	for (const item of items) {
		const block: SlackSectionBlock = {
			type: "section",
			text: {
				type: "mrkdwn",
				text: `*${item.title}*\n_${item.description}_`,
			},
		};

		if (item.image) {
			block.accessory = {
				type: "image",
				image_url: item.image,
				alt_text: item.title,
			};
		}

		blocks.push(block);
	}

	slack.sendMessage({
		channel: context.slack_channel_id,
		thread_ts: context.slack_thread_ts,
		blocks,
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
