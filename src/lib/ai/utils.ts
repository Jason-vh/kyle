import { createLogger } from "@/lib/logger";
import { createOpenAI } from "@ai-sdk/openai";
import { generateText } from "ai";

const logger = createLogger("ai/utils");

export async function generateStatus(message: string) {
	try {
		const openai = createOpenAI({
			apiKey: process.env.OPENAI_API_KEY,
		});

		const model = openai("gpt-3.5-turbo");

		const prompt = `
			A user has asked an agent to perform a task. The agent is currently processing the task,
			and we need a status message to indicate that the agent is working on it.

			Generate that status message.

			The message should be:
			- amusing
			- a single line of text
			- between one and three words
			- in the form "is {verb}ing..." (without the quotation marks)
  
			An example of a good status message is "is cooking..." or "is flabbergasting...".

			The original user message is: ${message}
    `;
		const result = await generateText({
			model,
			prompt,
		});

		return result.text.replace(/""/g, "").trim();
	} catch (error) {
		logger.error("Error generating status", { error });
		return "is cooking...";
	}
}
