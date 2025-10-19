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
		recipient_team_id: context.slack_team_id,
		recipient_user_id: context.slack_user_id,
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

export function stopStream(context: SlackContext) {
	if (!context.slack_stream_ts) {
		logger.warn("stopStream: no stream timestamp", { context });
		return;
	}

	return slack.stopStream({
		channel: context.slack_channel_id,
		ts: context.slack_stream_ts,
		blocks: context.message_queue,
	});
}

function createMediaObjectBlock(
	title: string,
	description: string,
	image?: string
): SlackSectionBlock {
	const block: SlackSectionBlock = {
		type: "section",
		text: { type: "mrkdwn", text: `> *${title}*\n> ${description}` },
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

export function queueMessage(context: SlackContext, blocks: SlackBlock[]) {
	if (!context.message_queue) {
		context.message_queue = [];
	}

	// add blocks to the end of the queue
	context.message_queue.push(...blocks);
	logger.debug("queued message", { blockCount: blocks.length, context });
}

// export function sendMessageQueue(context: SlackContext) {
// 	if (!context.message_queue?.length) {
// 		return;
// 	}

// 	logger.debug("sending message queue", {
// 		queueLength: context.message_queue.length,
// 		context,
// 	});

// 	for (const blocks of context.message_queue) {
// 		slack.sendMessage({
// 			channel: context.slack_channel_id,
// 			thread_ts: context.slack_thread_ts,
// 			blocks,
// 		});
// 	}

// 	context.message_queue = [];
// }
