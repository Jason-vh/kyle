import { createLogger } from "@/lib/logger";
import * as slack from "@/lib/slack/api";
import type { SlackContext } from "@/types";
import { generateToolCallMessage } from "../ai/generators";
import type { SlackBlock, SlackContextBlock, SlackSectionBlock } from "./types";

const logger = createLogger("slack/service");

export async function appendToolUsageMessage(
	context: SlackContext,
	tool: string,
	description: string
) {
	const status = await generateToolCallMessage(tool, description);

	await appendToStream(context, status + "\n");
}

export async function startStream(context: SlackContext) {
	const result = await slack.startStream({
		channel: context.slack_channel_id,
		thread_ts: context.slack_thread_ts,
	});

	context.slack_stream_ts = result.ts;

	return result;
}

export async function appendToStream(context: SlackContext, text: string) {
	if (!context.slack_stream_ts) {
		const stream = await startStream(context);
		context.slack_stream_ts = stream.ts;
	}

	return slack.appendStream({
		channel: context.slack_channel_id,
		ts: context.slack_stream_ts,
		markdown_text: text,
	});
}

export function stopStream(context: SlackContext, text?: string) {
	if (!context.slack_stream_ts) {
		logger.warn("stopStream: no stream timestamp", { context });
		return;
	}

	return slack.stopStream({
		channel: context.slack_channel_id,
		ts: context.slack_stream_ts,
		markdown_text: text,
	});
}

export function sendMediaObject(
	context: SlackContext,
	{
		title,
		description,
		action,
		image,
	}: {
		title: string;
		action?: string;
		description: string;
		image?: string;
	}
) {
	const blocks: SlackBlock[] = [];

	const titleBlock: SlackSectionBlock = {
		type: "section",
		text: {
			type: "mrkdwn",
			text: `*${title}*`,
		},
	};

	blocks.push(titleBlock);

	const descriptionBlock: SlackSectionBlock = {
		type: "section",
		text: {
			type: "mrkdwn",
			text: `> ${description}`,
		},
	};

	if (image) {
		descriptionBlock.accessory = {
			type: "image",
			image_url: image,
			alt_text: title,
		};
	}

	blocks.push(descriptionBlock);

	slack.sendMessage({
		channel: context.slack_channel_id,
		thread_ts: context.slack_thread_ts,
		blocks,
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
