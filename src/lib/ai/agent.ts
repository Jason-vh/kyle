import {
	APICallError,
	generateText,
	stepCountIs,
	streamText,
	type ModelMessage,
} from "ai";

import { MAX_TOOL_CALLS } from "@/lib/ai/constants";
import { getSystemPrompt } from "@/lib/ai/prompt";
import { createLogger } from "@/lib/logger";
import { getQbittorrentTools } from "@/lib/qbittorrent/tools";
import { getRadarrTools } from "@/lib/radarr/tools";
import * as slack from "@/lib/slack/api";
import * as slackService from "@/lib/slack/service";
import { getSlackTools } from "@/lib/slack/tools";
import { getSonarrTools } from "@/lib/sonarr/tools";
import { getTMDBTools } from "@/lib/tmdb/tools";
import { getUltraTools } from "@/lib/ultra/tools";
import type { MessageWithContext, SlackContext } from "@/types";
import { createOpenAI } from "@ai-sdk/openai";

const logger = createLogger("ai/agent");

const openai = createOpenAI({
	apiKey: Bun.env.OPENAI_API_KEY,
});

const model = openai("gpt-5-nano");

export async function streamMessage(
	message: MessageWithContext,
	context: SlackContext
): Promise<void> {
	const systemPrompt = getSystemPrompt({
		username: message.user.username,
		userId: message.user.id,
	});

	const messages: ModelMessage[] = [{ role: "system", content: systemPrompt }];

	messages.push({
		role: "system",
		content: `This is the conversation history: ${JSON.stringify(
			message.history
		)}`,
	});

	messages.push({
		role: "user",
		content: message.text,
	});

	const tools = {
		...getRadarrTools(context),
		...getSonarrTools(context),
		...getUltraTools(context),
		...getQbittorrentTools(context),
		...getTMDBTools(context),
		...getSlackTools(context),
	};

	const { fullStream } = streamText({
		model,
		messages,
		tools,
		stopWhen: stepCountIs(MAX_TOOL_CALLS),
	});

	for await (const part of fullStream) {
		if (part.type === "text-delta") {
			await slackService.appendToStream(context, part.text);
		}
	}

	await slackService.stopStream(context);
}

export async function processMessage(
	message: MessageWithContext,
	context: SlackContext
): Promise<void> {
	try {
		const systemPrompt = getSystemPrompt({
			username: message.user.username,
			userId: message.user.id,
		});

		const messages: ModelMessage[] = [
			{ role: "system", content: systemPrompt },
		];

		messages.push({
			role: "system",
			content: `This is the conversation history: ${JSON.stringify(
				message.history
			)}`,
		});

		messages.push({
			role: "user",
			content: message.text,
		});

		const tools = {
			...getRadarrTools(context),
			...getSonarrTools(context),
			...getUltraTools(context),
			...getQbittorrentTools(context),
			...getTMDBTools(context),
			...getSlackTools(context),
		};

		logger.info("generating text", { message, context });

		const result = await generateText({
			model,
			tools,
			messages,
			onStepFinish: (step) => {
				logger.debug("completed step", {
					text: step.text,
					finishReason: step.finishReason,
					context,
				});
			},
			stopWhen: stepCountIs(MAX_TOOL_CALLS),
		});

		logger.info("completed text generation", {
			message,
			text: result.text,
			context,
		});

		// Slack uses single asterisks for bold, but the AI model uses double asterisks
		// this is a quick fix to ensure the formatting is correct
		const textWithCorrectedFormatting = result.text.replace(/\*\*/g, "*");

		await slack.sendMessage({
			channel: context.slack_channel_id,
			thread_ts: context.slack_thread_ts,
			text: textWithCorrectedFormatting,
		});
	} catch (error) {
		logger.error("error:", { error, context });

		let errorMessage =
			"Alas, a thing has gone wrong. Please do make another attempt at a later date (or not - up to you).";

		if (APICallError.isInstance(error) && error.statusCode === 429) {
			errorMessage =
				"Whoa there, I'm being rate limited by the AI provider. Please try again in a few moments.";
		}

		await slack.sendMessage({
			channel: context.slack_channel_id,
			thread_ts: context.slack_thread_ts,
			text: errorMessage,
		});
	}
}
