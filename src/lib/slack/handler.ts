import * as agent from "@/lib/ai/agent";
import { generateInitialStatus } from "@/lib/ai/generators";
import { createLogger } from "@/lib/logger";
import * as slack from "@/lib/slack/api";
import { BOT_USER_ID } from "@/lib/slack/constants";
import type { SlackEvent, SlackMessageEvent } from "@/lib/slack/types";
import { buildMessageContext } from "@/lib/slack/utils";
import type { SlackContext } from "@/types";

const logger = createLogger("slack/handler");

async function setStatus(event: SlackMessageEvent, threadTs: string) {
	// We first set a default status while we generate the actual status
	await slack.setThreadStatus({
		channel_id: event.channel,
		thread_ts: threadTs,
		status: "is cooking...",
	});

	// ... and then generate a more interesting status
	const generatedStatus = await generateInitialStatus(event.text);
	await slack.setThreadStatus({
		channel_id: event.channel,
		thread_ts: threadTs,
		status: generatedStatus,
	});
}

export async function handleSlackEvent(
	event: SlackEvent,
	context: SlackContext
): Promise<void> {
	if (!event) {
		logger.error("no event data", { context });
		return;
	}

	if (event.type !== "message") {
		logger.debug(`skipping unknown ${event.type} event`, { context });
		return;
	}

	if (event.subtype === "message_changed") {
		logger.debug(`skipping message.message_changed event`, { context });
		return;
	}

	if (event.bot_profile) {
		logger.debug(`message is from bot ${event.bot_profile.name} - skipping`, {
			context,
		});
		return;
	}

	const isDirectMessage = event.channel_type === "im";
	if (!isDirectMessage && !event.text?.includes(`<@${BOT_USER_ID}>`)) {
		logger.debug(
			"message is not a direct message and does not mention the bot - skipping",
			{ context }
		);
		return;
	}

	const threadTs = event.thread_ts || event.ts;
	const message = await buildMessageContext(threadTs, event);

	logger.info("built message context", { message, context });

	// We first set a default status while we generate the actual status
	// this is intentionally not awaited so that we can continue processing the message
	setStatus(event, threadTs);

	await agent.processMessage(
		message,
		context,
		async (responseText) => {
			logger.debug("sending reply", { responseText, context });

			await slack.sendMessage({
				channel: event.channel,
				thread_ts: threadTs,
				text: responseText,
			});
		},
		async (status) => {
			logger.debug("updating status", { status, context });

			await slack.setThreadStatus({
				channel_id: event.channel,
				thread_ts: threadTs,
				status,
			});
		}
	);

	// clear the thread status
	await slack.setThreadStatus({
		channel_id: event.channel,
		thread_ts: threadTs,
		status: "",
	});
}
