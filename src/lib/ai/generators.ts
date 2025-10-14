import { createLogger } from "@/lib/logger";
import { createOpenAI } from "@ai-sdk/openai";
import { generateText } from "ai";

const logger = createLogger("ai/utils");

const INITIAL_STATUS_PROMPT = `
	# TASK
	Generate a playful status message for Kyle, a media library assistant who is currently processing a user request.

	# OUTPUT FORMAT
	- Exactly this format: "is {verb}ing..."
	- No quotation marks, extra punctuation, or additional text
	- Single line only
	- 1-3 words total (including "is" and "...")

	# TONE & STYLE
	- Playful and amusing
	- Clever or unexpected verb choices when appropriate
	- Family-friendly and professional
	- Match Kyle's friendly personality

	# CONTEXT INTEGRATION
	- Consider the user's request when choosing the verb
	- For media requests: cooking, brewing, hunting, fetching, summoning
	- For searches: scouring, investigating, spelunking, excavating
	- For downloads: grabbing, snatching, acquiring, procuring
	- General fallbacks: pondering, contemplating, orchestrating, calculating

	# EXAMPLES
	Good: "is cooking...", "is brewing...", "is summoning...", "is excavating..."
	Bad: "is working...", "is processing...", "is loading..."

	User request: {message}"
`;

export async function generateInitialStatus(message: string): Promise<string> {
	try {
		const openai = createOpenAI({
			apiKey: Bun.env.OPENAI_API_KEY,
		});

		const model = openai("gpt-4o-mini");

		const prompt = INITIAL_STATUS_PROMPT.replace("{message}", message);

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

const TOOL_CALL_STATUS_PROMPT = `
	You are Kyle, a media library assistant who is currently processing a user request.

	You are calling a tool to help the user. The tool is {tool}, which has the following description: {description}.

	Generate a short status message for the tool call.

	Some examples:
	- "I'm taking a look at which movies you have in Radarr"
	- "I'm checking which series you have in Sonarr"
	- "I'm fetching the queue from Radarr"

	Feel free to be creative with the status message.

	# OUTPUT FORMAT
	- DO NOT use any punctuation
	- Only output a single line
	- Never use the actual tool name
`;

export async function generateToolCallMessage(
	tool: string,
	description: string
): Promise<string> {
	try {
		const openai = createOpenAI({
			apiKey: Bun.env.OPENAI_API_KEY,
		});

		const model = openai("gpt-4o-mini");

		const prompt = TOOL_CALL_STATUS_PROMPT.replace("{tool}", tool).replace(
			"{description}",
			description
		);

		const result = await generateText({
			model,
			prompt,
		});

		return result.text.replace(/""/g, "").trim();
	} catch (error) {
		logger.error("Error generating tool call status", { error });

		return "is doing a thing";
	}
}
