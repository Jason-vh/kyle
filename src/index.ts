import { createLogger } from "@/lib/logger";
import { handleSlackEvent } from "@/lib/slack/handler";
import type { SlackEventBody } from "@/lib/slack/types";
import "dotenv/config";

const logger = createLogger("main");

const port = parseInt(process.env.PORT || "3000");

const server = Bun.serve({
	port,
	routes: {
		"/": Response.json({ hello: "world" }),
		"/slack/events": {
			POST: async (req: Request) => {
				try {
					const body = (await req.json()) as SlackEventBody;

					if (body.type === "url_verification") {
						logger.log("handling URL verification challenge");
						return Response.json({ challenge: body.challenge });
					}

					logger.log(`received ${body.event.type} event`, { body });

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
	fetch() {
		return new Response("Not Found", { status: 404 });
	},
});

logger.log(`🤖 Kyle bot listening on http://localhost:${server.port}`);

// Graceful shutdown handling for PM2
process.on("SIGTERM", () => {
	logger.log("Received SIGTERM, shutting down gracefully");
	server.stop();
	process.exit(0);
});

process.on("SIGINT", () => {
	logger.log("Received SIGINT, shutting down gracefully");
	server.stop();
	process.exit(0);
});
