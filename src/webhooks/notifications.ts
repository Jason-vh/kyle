import { complete, getModel, type TextContent } from "@mariozechner/pi-ai";
import { createLogger } from "../logger.ts";
import type { MediaNotificationInfo } from "./types.ts";

const log = createLogger("webhooks:notifications");

const NOTIFICATION_SYSTEM_PROMPT = `You are Kyle, a friendly media library assistant. You're sending a notification that a requested movie or TV show has finished downloading and is now available to watch on Plex.

Guidelines:
- Be casual and concise (1-2 sentences max)
- Don't use emojis
- Don't ask questions or suggest actions
- Mention the title and year
- If quality info is provided, you can mention it briefly
- For TV episodes, mention which episodes are ready
- Sound natural, like a friend letting someone know their download is ready`;

function formatMediaDescription(media: MediaNotificationInfo): string {
  let desc = `${media.title} (${media.year})`;

  if (media.mediaType === "series" && media.episodes?.length) {
    const episodeList = media.episodes
      .map((e) => `S${String(e.seasonNumber).padStart(2, "0")}E${String(e.episodeNumber).padStart(2, "0")} "${e.title}"`)
      .join(", ");
    desc += ` - Episodes: ${episodeList}`;
  }

  if (media.quality) {
    desc += ` [${media.quality}]`;
  }

  return desc;
}

function formatFallbackMessage(media: MediaNotificationInfo): string {
  if (media.mediaType === "series" && media.episodes?.length) {
    const episodeList = media.episodes
      .map((e) => `S${String(e.seasonNumber).padStart(2, "0")}E${String(e.episodeNumber).padStart(2, "0")}`)
      .join(", ");
    return `${media.title} (${media.year}) - ${episodeList} is now available on Plex.`;
  }
  return `${media.title} (${media.year}) is now available on Plex.`;
}

export async function generateNotificationMessage(
  media: MediaNotificationInfo,
): Promise<string> {
  try {
    const model = getModel("anthropic", "claude-haiku-4-5-20251001");
    const description = formatMediaDescription(media);

    const response = await complete(model, {
      systemPrompt: NOTIFICATION_SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `Generate a notification for: ${description}`,
          timestamp: Date.now(),
        },
      ],
    }, {
      maxTokens: 150,
      temperature: 0.8,
    });

    const text = response.content
      .filter((c): c is TextContent => c.type === "text")
      .map((c) => c.text)
      .join("");

    if (!text) {
      throw new Error("Empty response from model");
    }

    log.info("generated notification", { media: description, message: text });
    return text;
  } catch (error) {
    log.error("notification generation failed, using fallback", {
      title: media.title,
      error: error instanceof Error ? error.message : String(error),
    });
    return formatFallbackMessage(media);
  }
}
