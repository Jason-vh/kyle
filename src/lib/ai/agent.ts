import { generateText, stepCountIs, tool, type ModelMessage } from "ai";

import { getSystemPrompt } from "@/lib/ai/prompt";
import { createLogger } from "@/lib/logger";
import { radarrTools } from "@/lib/radarr/tools";
import { sonarrTools } from "@/lib/sonarr/tools";
import { ultraTools } from "@/lib/ultra/tools";
import { MessageWithContext } from "@/types";
import { createOpenAI } from "@ai-sdk/openai";
import z from "zod";
import { MAX_TOOL_CALLS } from "./constants";

const logger = createLogger("ai/agent");

export async function processMessage(
	message: MessageWithContext,
	reply: (message: string) => Promise<void>,
	updateStatus: (status: string) => Promise<void>
): Promise<void> {
	try {
		const openai = createOpenAI({
			apiKey: process.env.OPENAI_API_KEY,
		});

		const model = openai("gpt-5-nano");

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

		// we track whether the agent has replied to the user
		let hasReplied = false;

		const slackTools = {
			reply: tool({
				description:
					"Reply in the thread. No need to reply if it's your final reply - this will be sent automatically.",
				inputSchema: z.object({
					message: z.string(),
				}),
				execute: async ({ message }) => {
					hasReplied = true;
					await reply(message);
				},
			}),
		};

		const tools = {
			...radarrTools,
			...sonarrTools,
			...ultraTools,
			...slackTools,
			webSearch: openai.tools.webSearch({
				searchContextSize: "low",
			}),
		};

		logger.log("generating text", { originalMessage: message.text });

		const result = await generateText({
			model,
			tools,
			messages,
			providerOptions: {
				openai: {
					reasoning_effort: "minimal",
				},
			},
			stopWhen: stepCountIs(MAX_TOOL_CALLS),
		});

		logger.log(`completed text generation`, {
			originalMessage: message.text,
			result,
		});

		await updateStatus("");

		if (!hasReplied) {
			await reply(result.text);
		}
	} catch (error) {
		logger.error("error:", { error });
		await reply(
			"Alas, a thing has gone wrong. Please do make another attempt at a later date (or not - up to you)."
		);
	}
}
