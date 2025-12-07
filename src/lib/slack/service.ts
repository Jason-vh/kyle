import { createLogger } from "@/lib/logger";
import * as slack from "@/lib/slack/api";
import { setThreadStatus } from "@/lib/slack/api";
import type {
	SlackBlock,
	SlackSectionBlock,
	SlackTableBlock,
} from "@/lib/slack/types";
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
	const blocks: SlackBlock[] = [];

	if (text) {
		blocks.push(createTextBlock(text));
	}

	if (context.message_queue?.length) {
		blocks.push(...context.message_queue);
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

/**
 * note: this causes the Slack API to throw a 500
 */
export function sendTable(context: SlackContext, rows: string[][]) {
	const columnSettings = rows[0]!.map(
		() =>
			({
				align: "left",
				is_wrapped: true,
			} as const)
	);

	const tableBlock: SlackTableBlock = {
		type: "table",
		column_settings: columnSettings,
		rows: rows.map((row) =>
			row.map((cell) => ({
				type: "raw_text",
				text: cell,
			}))
		),
	};

	console.log(JSON.stringify(tableBlock, null, 2));

	queueMessage(context, [tableBlock]);
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
