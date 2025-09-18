import { indexHtml } from "@/index-template";
import { createLogger } from "@/lib/logger";
import { handleSlackEvent } from "@/lib/slack/handler";
import { waitUntil } from "cloudflare:workers";
import { Hono } from "hono";
import { SlackEventBody } from "./lib/slack/types";

const logger = createLogger("main");

const app = new Hono<{ Bindings: Env }>();

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

			logger.log(`received ${body.event.type} event`);

			// we first respond with 200 to the Slack API to confirm that we received the event
			await next();

			// ... and then handle the event
			waitUntil(handleSlackEvent(body.event));
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

export default app;
