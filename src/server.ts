import { createLogger } from "./logger.ts";
import { handleHealth } from "./routes/health.ts";
import { handleChat } from "./routes/chat.ts";
import { handleSlackEvents } from "./routes/slack-events.ts";
import { handleSonarrWebhook, handleRadarrWebhook } from "./webhooks/handler.ts";
import { handleThread } from "./routes/threads.ts";
import { handleThreadList } from "./routes/threads-list.ts";
import { handleLogin } from "./routes/threads-auth.ts";

const log = createLogger("server");

export function startServer(port: number) {
  const server = Bun.serve({
    port,
    async fetch(req) {
      const url = new URL(req.url);

      try {
        if (req.method === "GET" && url.pathname === "/health") {
          return await handleHealth();
        }

        if (req.method === "GET" && url.pathname === "/") {
          return Response.json({
            name: "kyle",
            version: "2.0.0",
            status: "running",
          });
        }

        if (req.method === "POST" && url.pathname === "/chat") {
          return await handleChat(req);
        }

        if (req.method === "POST" && url.pathname === "/slack/events") {
          return await handleSlackEvents(req);
        }

        if (req.method === "POST" && url.pathname === "/webhooks/sonarr") {
          return await handleSonarrWebhook(req);
        }

        if (req.method === "POST" && url.pathname === "/webhooks/radarr") {
          return await handleRadarrWebhook(req);
        }

        // Thread viewer login
        if (url.pathname === "/threads/login") {
          return await handleLogin(req);
        }

        // Thread list
        if (req.method === "GET" && (url.pathname === "/threads" || url.pathname === "/threads/")) {
          return await handleThreadList(req);
        }

        // Thread viewer
        if (req.method === "GET" && url.pathname.startsWith("/threads/")) {
          const segments = url.pathname.split("/");
          if (segments.length === 3 && segments[2]) {
            return await handleThread(req, segments[2]);
          }
        }

        log.warn("not found", { method: req.method, path: url.pathname });
        return Response.json({ error: "Not found" }, { status: 404 });
      } catch (error) {
        log.error("unhandled error", {
          method: req.method,
          path: url.pathname,
          error: error instanceof Error ? error.message : String(error),
        });
        return Response.json({ error: "Internal server error" }, { status: 500 });
      }
    },
  });

  log.info("server started", { port: server.port });
  return server;
}
