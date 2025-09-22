import { generateText, stepCountIs, type ModelMessage } from "ai";

import { MAX_TOOL_CALLS } from "@/lib/ai/constants";
import { getSystemPrompt } from "@/lib/ai/prompt";
import { createLogger } from "@/lib/logger";
import { getRadarrTools } from "@/lib/radarr/tools";
import { getSonarrTools } from "@/lib/sonarr/tools";
import { getUltraTools } from "@/lib/ultra/tools";
import type { MessageWithContext, SlackContext } from "@/types";
import { createOpenAI } from "@ai-sdk/openai";

const logger = createLogger("ai/agent");

export async function processMessage(
	message: MessageWithContext,
	context: SlackContext,
	reply: (message: string) => Promise<void>,
	updateStatus: (status: string) => Promise<void>
): Promise<void> {
	try {
		const openai = createOpenAI({
			apiKey: Bun.env.OPENAI_API_KEY,
		});

		const model = openai("gpt-4o");

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

		await reply(textWithCorrectedFormatting);
	} catch (error) {
		logger.error("error:", { error, context });
		await reply(
			"Alas, a thing has gone wrong. Please do make another attempt at a later date (or not - up to you)."
		);
	}
}
