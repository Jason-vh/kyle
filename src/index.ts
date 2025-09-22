import { createLogger } from "@/lib/logger";
import { handleSlackEvent } from "@/lib/slack/handler";
import type { SlackEventBody } from "@/lib/slack/types";

const logger = createLogger("main");

if (!Bun.env.PORT) {
	throw new Error("PORT is not set");
}

const port = parseInt(Bun.env.PORT);

const server = Bun.serve({
	port,
	hostname: "0.0.0.0",
	routes: {
		"/kyle/slack/events": {
			POST: async (req: Request) => {
				try {
					const body = (await req.json()) as SlackEventBody;

					if (body.type === "url_verification") {
						logger.info("handling URL verification challenge");
						return Response.json({ challenge: body.challenge });
					}

					logger.info(`received ${body.event.type} event`, { body });

					// Handle the event asynchronously after acknowledging
					queueMicrotask(() => {
						handleSlackEvent(body.event);
					});

					return Response.json({ status: "ok" });
				} catch (error) {
					logger.error("Failed to parse Slack event", { error });
					return Response.json(
						{ error: "Internal server error" },
						{ status: 500 }
					);
				}
			},
		},
	},
	// Fallback for unmatched routes
	fetch(req: Request) {
		logger.info(`received request to unmatched route ${req.url}`);
		return new Response("Hi! I'm Kyle :) 🤖", { status: 404 });
	},
});

logger.info(`🤖 Kyle bot listening on http://localhost:${server.port}`);

// Graceful shutdown handling for PM2
process.on("SIGTERM", () => {
	logger.info("Received SIGTERM, shutting down gracefully");
	server.stop();
	process.exit(0);
});

process.on("SIGINT", () => {
	logger.info("Received SIGINT, shutting down gracefully");
	server.stop();
	process.exit(0);
});
