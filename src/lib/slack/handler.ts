import * as agent from "@/lib/ai/agent";
import { generateStatus } from "@/lib/ai/utils";
import { createLogger } from "@/lib/logger";
import { createSlackClient, SlackClient } from "@/lib/slack/client";
import { BOT_USER_ID } from "@/lib/slack/constants";
import { SlackEvent, SlackMessageEvent } from "@/lib/slack/types";
import { buildMessageContext } from "@/lib/slack/utils";

const logger = createLogger("slack/handler");

export async function handleSlackEvent(event: SlackEvent): Promise<void> {
	if (!event) {
		logger.error("no event data");
		return;
	}

	if (event.type !== "message") {
		logger.log(`skipping unknown ${event.type} event`);
		return;
	}

	if (event.subtype === "message_changed") {
		logger.log(`skipping message.message_changed event`);
		return;
	}

	const slackClient = createSlackClient();
	await handleMessage(event, slackClient);
}

async function handleMessage(
	event: SlackMessageEvent,
	slackClient: SlackClient
) {
	if (event.bot_profile) {
		logger.debug(`message is from bot ${event.bot_profile.name} - skipping`);
		return;
	}

	const isDirectMessage = event.channel_type === "im";
	if (!isDirectMessage && !event.text?.includes(`<@${BOT_USER_ID}>`)) {
		logger.debug(
			"message is not a direct message and does not mention the bot - skipping"
		);
		return;
	}

	const threadTs = event.thread_ts || event.ts;
	const messageWithContext = await buildMessageContext(
		threadTs,
		event,
		slackClient
	);

	// We first set a default status while we generate the actual status
	await slackClient.setThreadStatus({
		channel_id: event.channel,
		thread_ts: threadTs,
		status: "is cooking...",
	});

	// ... and then generate a more interesting status
	const generatedStatus = await generateStatus(event.text);
	await slackClient.setThreadStatus({
		channel_id: event.channel,
		thread_ts: threadTs,
		status: generatedStatus,
	});

	await agent.processMessage(
		messageWithContext,
		async (responseText) => {
			logger.log("sending reply", { responseText });

			await slackClient.postMessage({
				channel: event.channel,
				thread_ts: threadTs,
				text: responseText,
			});
		},
		async (status) => {
			logger.log("updating status", { status });

			await slackClient.setThreadStatus({
				channel_id: event.channel,
				thread_ts: threadTs,
				status,
			});
		}
	);

	// clear the thread status
	await slackClient.setThreadStatus({
		channel_id: event.channel,
		thread_ts: threadTs,
		status: "",
	});
}
