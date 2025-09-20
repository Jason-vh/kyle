import { generateText, stepCountIs, type ModelMessage } from "ai";

import { getSystemPrompt } from "@/lib/ai/prompt";
import { createLogger } from "@/lib/logger";
import { radarrTools } from "@/lib/radarr/tools";
import { sonarrTools } from "@/lib/sonarr/tools";
import { ultraTools } from "@/lib/ultra/tools";
import { MessageWithContext } from "@/types";
import { createAnthropic } from "@ai-sdk/anthropic";
import { MAX_TOOL_CALLS } from "./constants";

const logger = createLogger("ai/agent");

export async function processMessage(
	message: MessageWithContext,
	reply: (message: string) => Promise<void>,
	updateStatus: (status: string) => Promise<void>
): Promise<void> {
	try {
		const anthropic = createAnthropic({
			apiKey: process.env.ANTHROPIC_API_KEY,
		});

		const model = anthropic("claude-3-7-sonnet-20250219");

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
			...radarrTools,
			...sonarrTools,
			...ultraTools,
		};

		logger.log("generating text", { originalMessage: message.text });

		const result = await generateText({
			model,
			tools,
			messages,
			stopWhen: stepCountIs(MAX_TOOL_CALLS),
		});

		logger.log(`completed text generation`, {
			originalMessage: message.text,
			result,
		});

		await reply(result.text);
	} catch (error) {
		logger.error("error:", { error });
		await reply(
			"Alas, a thing has gone wrong. Please do make another attempt at a later date (or not - up to you)."
		);
	}
}
