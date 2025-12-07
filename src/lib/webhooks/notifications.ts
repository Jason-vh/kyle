import { generateText } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";

import { createLogger } from "@/lib/logger";
import type { MediaNotificationInfo } from "./types";

const logger = createLogger("webhooks/notifications");

const anthropic = createAnthropic({
	apiKey: Bun.env.ANTHROPIC_API_KEY,
});

const model = anthropic("claude-3-5-haiku-latest");

/**
 * Generate an AI-powered notification message for when media becomes available
 */
export async function generateNotificationMessage(
	media: MediaNotificationInfo
): Promise<string> {
	const mediaDescription = formatMediaDescription(media);

	const prompt = `You are Kyle, a friendly media bot. A movie or TV show that a user requested is now available in their media library.

Generate a brief, friendly notification message (1-2 sentences max). Be conversational and casual. Don't use emojis.

Media details:
${mediaDescription}

Guidelines:
- Keep it short and punchy
- Be excited but not over the top
- For TV shows, mention which episode(s) are ready
- You can mention the quality if it's notable (4K, etc.)

Example good messages:
- "Inception just finished downloading - it's ready to watch!"
- "Breaking Bad S01E05 'Gray Matter' is now in the library."
- "The new episode of Severance is ready - S02E03 'Who Is Alive?'"

Respond with ONLY the notification message, nothing else.`;

	try {
		const { text } = await generateText({
			model,
			prompt,
		});

		logger.debug("generated notification", { media, message: text });
		return text.trim();
	} catch (error) {
		logger.error("failed to generate notification", { media, error });
		// Fallback to a simple message if AI fails
		return formatFallbackMessage(media);
	}
}

/**
 * Format media details for the AI prompt
 */
function formatMediaDescription(media: MediaNotificationInfo): string {
	const lines: string[] = [];

	lines.push(`Title: ${media.title}`);
	lines.push(`Year: ${media.year}`);
	lines.push(`Type: ${media.mediaType}`);

	if (media.quality) {
		lines.push(`Quality: ${media.quality}`);
	}

	if (media.releaseGroup) {
		lines.push(`Release Group: ${media.releaseGroup}`);
	}

	if (media.episodes && media.episodes.length > 0) {
		const episodeList = media.episodes
			.map((ep) => `S${String(ep.seasonNumber).padStart(2, "0")}E${String(ep.episodeNumber).padStart(2, "0")} "${ep.title}"`)
			.join(", ");
		lines.push(`Episodes: ${episodeList}`);
	}

	return lines.join("\n");
}

/**
 * Simple fallback message if AI generation fails
 */
function formatFallbackMessage(media: MediaNotificationInfo): string {
	if (media.mediaType === "movie") {
		return `${media.title} (${media.year}) is now available in your library.`;
	}

	if (media.episodes && media.episodes.length > 0) {
		const ep = media.episodes[0]!;
		const episodeCode = `S${String(ep.seasonNumber).padStart(2, "0")}E${String(ep.episodeNumber).padStart(2, "0")}`;
		return `${media.title} ${episodeCode} is now available in your library.`;
	}

	return `${media.title} is now available in your library.`;
}
