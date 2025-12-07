import { findMediaRequesters } from "@/lib/db/repository";
import { createLogger } from "@/lib/logger";
import * as slack from "@/lib/slack/api";
import { mrkdwnFormat } from "@/lib/slack/utils";

import { generateNotificationMessage } from "./notifications";
import type {
	MediaNotificationInfo,
	RadarrWebhookPayload,
	SonarrWebhookPayload,
} from "./types";

const logger = createLogger("webhooks/handler");

/**
 * Handle incoming Radarr webhook
 */
export async function handleRadarrWebhook(req: Request): Promise<Response> {
	try {
		const payload = (await req.json()) as RadarrWebhookPayload;

		logger.info("received radarr webhook", {
			eventType: payload.eventType,
			movie: payload.movie?.title,
		});

		// Only handle initial downloads, not upgrades
		if (payload.eventType === "Upgrade") {
			logger.debug("ignoring upgrade event");
			return Response.json({ status: "ignored", reason: "upgrade" });
		}

		// Handle test webhooks
		if (payload.eventType === "Test") {
			logger.info("received test webhook from Radarr");
			return Response.json({ status: "ok", message: "test received" });
		}

		if (payload.eventType !== "Download") {
			logger.warn("unexpected event type", { eventType: payload.eventType });
			return Response.json({ status: "ignored", reason: "unknown event" });
		}

		// Find users who requested this movie
		const requesters = await findMediaRequesters("movie", {
			tmdbId: payload.movie.tmdbId,
			radarrId: payload.movie.id,
		});

		if (requesters.length === 0) {
			logger.debug("no requesters found for movie", {
				title: payload.movie.title,
				tmdbId: payload.movie.tmdbId,
			});
			return Response.json({ status: "ok", notified: 0 });
		}

		// Build media info for notification
		const mediaInfo: MediaNotificationInfo = {
			mediaType: "movie",
			title: payload.movie.title,
			year: payload.movie.year,
			quality: payload.release?.quality,
			releaseGroup: payload.release?.releaseGroup,
		};

		// Notify each requester
		await notifyRequesters(requesters, mediaInfo);

		return Response.json({ status: "ok", notified: requesters.length });
	} catch (error) {
		logger.error("error handling radarr webhook", { error });
		return Response.json({ error: "internal error" }, { status: 500 });
	}
}

/**
 * Handle incoming Sonarr webhook
 */
export async function handleSonarrWebhook(req: Request): Promise<Response> {
	try {
		const payload = (await req.json()) as SonarrWebhookPayload;

		logger.info("received sonarr webhook", {
			eventType: payload.eventType,
			series: payload.series?.title,
			episodeCount: payload.episodes?.length,
		});

		// Only handle initial downloads, not upgrades
		if (payload.eventType === "Upgrade") {
			logger.debug("ignoring upgrade event");
			return Response.json({ status: "ignored", reason: "upgrade" });
		}

		// Handle test webhooks
		if (payload.eventType === "Test") {
			logger.info("received test webhook from Sonarr");
			return Response.json({ status: "ok", message: "test received" });
		}

		if (payload.eventType !== "Download") {
			logger.warn("unexpected event type", { eventType: payload.eventType });
			return Response.json({ status: "ignored", reason: "unknown event" });
		}

		// Find users who requested this series
		const requesters = await findMediaRequesters("series", {
			tvdbId: payload.series.tvdbId,
			sonarrId: payload.series.id,
		});

		if (requesters.length === 0) {
			logger.debug("no requesters found for series", {
				title: payload.series.title,
				tvdbId: payload.series.tvdbId,
			});
			return Response.json({ status: "ok", notified: 0 });
		}

		// Build media info for notification
		const mediaInfo: MediaNotificationInfo = {
			mediaType: "series",
			title: payload.series.title,
			year: payload.series.year,
			quality: payload.release?.quality,
			releaseGroup: payload.release?.releaseGroup,
			episodes: payload.episodes.map((ep) => ({
				seasonNumber: ep.seasonNumber,
				episodeNumber: ep.episodeNumber,
				title: ep.title,
			})),
		};

		// Notify each requester
		await notifyRequesters(requesters, mediaInfo);

		return Response.json({ status: "ok", notified: requesters.length });
	} catch (error) {
		logger.error("error handling sonarr webhook", { error });
		return Response.json({ error: "internal error" }, { status: 500 });
	}
}

/**
 * Send notifications to all requesters
 */
async function notifyRequesters(
	requesters: Array<{
		userId: string;
		threadTs: string;
		channelId: string;
		title: string | null;
	}>,
	mediaInfo: MediaNotificationInfo
): Promise<void> {
	// Generate the notification message once (same message for all)
	const message = await generateNotificationMessage(mediaInfo);

	logger.info("sending notifications", {
		requesterCount: requesters.length,
		message,
	});

	// Send to each thread
	const notifications = requesters.map(async (requester) => {
		try {
			await slack.sendMessage({
				channel: requester.channelId,
				thread_ts: requester.threadTs,
				markdown_text: mrkdwnFormat(message),
			});

			logger.debug("sent notification", {
				userId: requester.userId,
				threadTs: requester.threadTs,
				channelId: requester.channelId,
			});
		} catch (error) {
			logger.error("failed to send notification", {
				requester,
				error,
			});
		}
	});

	await Promise.all(notifications);
}
