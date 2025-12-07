import { createLogger } from "@/lib/logger";
import * as slack from "@/lib/slack/api";
import { setThreadStatus } from "@/lib/slack/api";
import type { SlackBlock, SlackSectionBlock } from "@/lib/slack/types";
import { mrkdwnFormat } from "@/lib/slack/utils";
import type { SlackContext } from "@/types";

const logger = createLogger("slack/service");

function createTextBlock(text: string): SlackSectionBlock {
	return {
		type: "section",
		text: {
			type: "mrkdwn",
			text: mrkdwnFormat(text),
		},
	};
}

export function sendResponse(context: SlackContext, text?: string) {
	const hasQueuedBlocks = context.message_queue?.length;

	// If text only with no blocks, send as markdown_text
	if (text && !hasQueuedBlocks) {
		return slack.sendMessage({
			channel: context.slack_channel_id,
			thread_ts: context.slack_thread_ts,
			markdown_text: mrkdwnFormat(text),
		});
	}

	// If blocks (with or without text), send everything as blocks
	const blocks: SlackBlock[] = [];

	if (text) {
		blocks.push(createTextBlock(text));
	}

	if (hasQueuedBlocks) {
		blocks.push(...context.message_queue!);
	}

	if (blocks.length === 0) {
		return;
	}

	return slack.sendMessage({
		channel: context.slack_channel_id,
		thread_ts: context.slack_thread_ts,
		blocks,
	});
}

function createMediaObjectBlock(
	title: string,
	description: string,
	image?: string
): SlackSectionBlock {
	const block: SlackSectionBlock = {
		type: "section",
		text: {
			type: "mrkdwn",
			text: `> *${mrkdwnFormat(title)}*\n> ${mrkdwnFormat(description)}`,
		},
	};

	if (image) {
		block.accessory = {
			type: "image",
			image_url: image,
			alt_text: title,
		};
	}

	return block;
}

export function sendMediaObject(
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
	queueMessage(context, [createMediaObjectBlock(title, description, image)]);
}

export function sendMediaItems(
	context: SlackContext,
	items: {
		title: string;
		description: string;
		image?: string;
	}[]
) {
	queueMessage(
		context,
		items.map((item) =>
			createMediaObjectBlock(item.title, item.description, item.image)
		)
	);
}

export function queueMessage(context: SlackContext, blocks: SlackBlock[]) {
	if (!context.message_queue) {
		context.message_queue = [];
	}

	// add blocks to the end of the queue
	context.message_queue.push(...blocks);
	logger.debug("queued message", { blockCount: blocks.length, context });
}

export function sendToolCallUpdate(
	context: SlackContext,
	{
		status,
	}: {
		status?: string;
	} = {}
) {
	if (status) {
		setThreadStatus({
			channel_id: context.slack_channel_id,
			thread_ts: context.slack_thread_ts,
			status,
		});
	}
}
