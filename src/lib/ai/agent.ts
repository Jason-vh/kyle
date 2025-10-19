import { stepCountIs, streamText, type ModelMessage } from "ai";

import { MAX_TOOL_CALLS } from "@/lib/ai/constants";
import { getSystemPrompt } from "@/lib/ai/prompt";
import { getOdesliTools } from "@/lib/odesli/tools";
import { getQbittorrentTools } from "@/lib/qbittorrent/tools";
import { getRadarrTools } from "@/lib/radarr/tools";
import * as slackService from "@/lib/slack/service";
import { getSlackTools } from "@/lib/slack/tools";
import { getSonarrTools } from "@/lib/sonarr/tools";
import { getTMDBTools } from "@/lib/tmdb/tools";
import { getUltraTools } from "@/lib/ultra/tools";
import type { MessageWithContext, SlackContext } from "@/types";
import { createOpenAI } from "@ai-sdk/openai";

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
		...getOdesliTools(context),
	};

	const { text } = streamText({
		model,
		messages,
		tools,
		stopWhen: stepCountIs(MAX_TOOL_CALLS),
	});

	await slackService.appendToStream(context, await text);
	await slackService.stopStream(context);
}
