import { indexHtml } from "@/index-template";
import { createLogger } from "@/lib/logger";
import { handleSlackEvent } from "@/lib/slack/handler";
import { serve } from "@hono/node-server";
import "dotenv/config";
import { Hono } from "hono";
import { SlackEventBody } from "./lib/slack/types";

const logger = createLogger("main");

const app = new Hono();

app.get("/", (c) => c.html(indexHtml));

app.post(
	"/slack/events",
	async (c, next) => {
		try {
			const body: SlackEventBody = await c.req.json();

			if (body.type === "url_verification") {
				logger.log("handling URL verification challenge");
				return c.json({ challenge: body.challenge });
			}

			logger.log(`received ${body.event.type} event`, { body });

			// we first respond with 200 to the Slack API to confirm that we received the event
			await next();

			// ... and then handle the event
			handleSlackEvent(body.event);
		} catch (error) {
			logger.error("Failed to handle Slack event", { error });
			return c.json({ error: "Internal server error" }, 500);
		}
	},
	async (c) => c.json({ status: "ok" })
);

app.get("/health", (c) => {
	return c.json({ status: "healthy", timestamp: new Date().toISOString() });
});

const port = parseInt(process.env.PORT || "3000");

const server = serve({
	fetch: app.fetch,
	port,
});

logger.log(`🤖 Kyle bot started on port ${port}`);

// Graceful shutdown handling for PM2
process.on("SIGTERM", () => {
	logger.log("Received SIGTERM, shutting down gracefully");
	server.close(() => {
		logger.log("Server closed");
		process.exit(0);
	});
});

process.on("SIGINT", () => {
	logger.log("Received SIGINT, shutting down gracefully");
	server.close(() => {
		logger.log("Server closed");
		process.exit(0);
	});
});

export default app;
