import * as agent from "@/lib/ai/agent";
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
		status: "is thinking...",
	});

	// ... and then generate a more interesting status
	// const generatedStatus = await generateInitialStatus(event.text);
	// await slack.setThreadStatus({
	// 	channel_id: event.channel,
	// 	thread_ts: threadTs,
	// 	status: generatedStatus,
	// });
}

export async function handleSlackEvent(
	event: SlackEvent,
	context: SlackContext
): Promise<void> {
	if (!event) {
		return;
	}

	if (event.type !== "message") {
		return;
	}

	if (event.subtype === "message_changed" || event.subtype === "bot_message") {
		return;
	}

	if (event.streaming_state == "in_progress") {
		return;
	}

	if (event.bot_profile) {
		return;
	}

	const isDirectMessage = event.channel_type === "im";
	if (!isDirectMessage && !event.text?.includes(`<@${BOT_USER_ID}>`)) {
		return;
	}

	const threadTs = event.thread_ts || event.ts;

	try {
		// intentionally not awaited so that we can continue processing the message
		setStatus(event, threadTs);

		const message = await buildMessageContext(threadTs, event);

		logger.info("built message context", { message, context });

		// await agent.processMessage(message, context);
		await agent.streamMessage(message, context);
	} catch (error) {
		logger.error("error handling Slack event", { error, context });
	} finally {
		// clear the thread status
		await slack.setThreadStatus({
			channel_id: event.channel,
			thread_ts: threadTs,
			status: "",
		});
	}
}
