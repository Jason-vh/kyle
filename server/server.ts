import { createLogger } from "./logger.ts";
import { handleHealth } from "./routes/health.ts";
import { handleChat } from "./routes/chat.ts";
import { handleSlackEvents } from "./routes/slack-events.ts";
import { handleSonarrWebhook, handleRadarrWebhook } from "./webhooks/handler.ts";
import { handleApiThreadList, handleApiThreadDetail } from "./routes/api/threads.ts";
import { handleApiLogin, handleApiAuthStatus } from "./routes/api/auth.ts";

const log = createLogger("server");

const MAX_BODY_SIZE = 1_000_000; // 1 MB

function isBodyTooLarge(req: Request): boolean {
  const contentLength = req.headers.get("content-length");
  return !!contentLength && parseInt(contentLength, 10) > MAX_BODY_SIZE;
}

const SPA_PATHS = new Set(["/", "/threads", "/threads/", "/login"]);
const WEB_DIST = "web/dist";

async function serveSpaFile(pathname: string): Promise<Response | null> {
  // Try serving a static file from web/dist/
  if (pathname.startsWith("/assets/")) {
    const file = Bun.file(`${WEB_DIST}${pathname}`);
    if (await file.exists()) {
      return new Response(file, {
        headers: {
          "Cache-Control": "public, max-age=31536000, immutable",
        },
      });
    }
    return null;
  }

  // SPA routes → serve index.html
  if (SPA_PATHS.has(pathname) || pathname.startsWith("/threads/")) {
    const indexFile = Bun.file(`${WEB_DIST}/index.html`);
    if (await indexFile.exists()) {
      return new Response(indexFile, {
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "no-cache",
        },
      });
    }
  }

  return null;
}

export function startServer(port: number) {
  const server = Bun.serve({
    port,
    async fetch(req) {
      const url = new URL(req.url);

      try {
        if (req.method === "GET" && url.pathname === "/health") {
          return await handleHealth();
        }

        // --- API routes ---

        if (req.method === "GET" && url.pathname === "/api/threads") {
          return await handleApiThreadList(req);
        }

        if (req.method === "GET" && url.pathname.startsWith("/api/threads/")) {
          const id = url.pathname.slice("/api/threads/".length);
          if (id) {
            return await handleApiThreadDetail(req, id);
          }
        }

        if (req.method === "POST" && url.pathname === "/api/auth/login") {
          if (isBodyTooLarge(req)) {
            return Response.json({ error: "Payload too large" }, { status: 413 });
          }
          return await handleApiLogin(req);
        }

        if (req.method === "GET" && url.pathname === "/api/auth/status") {
          return await handleApiAuthStatus(req);
        }

        // --- Service routes ---

        if (req.method === "POST" && url.pathname === "/chat") {
          if (isBodyTooLarge(req)) {
            return Response.json({ error: "Payload too large" }, { status: 413 });
          }
          return await handleChat(req);
        }

        if (req.method === "POST" && url.pathname === "/slack/events") {
          if (isBodyTooLarge(req)) {
            return Response.json({ error: "Payload too large" }, { status: 413 });
          }
          return await handleSlackEvents(req);
        }

        if (req.method === "POST" && url.pathname === "/webhooks/sonarr") {
          if (isBodyTooLarge(req)) {
            return Response.json({ error: "Payload too large" }, { status: 413 });
          }
          return await handleSonarrWebhook(req);
        }

        if (req.method === "POST" && url.pathname === "/webhooks/radarr") {
          if (isBodyTooLarge(req)) {
            return Response.json({ error: "Payload too large" }, { status: 413 });
          }
          return await handleRadarrWebhook(req);
        }

        // --- SPA static file serving ---

        if (req.method === "GET") {
          const spaResponse = await serveSpaFile(url.pathname);
          if (spaResponse) return spaResponse;
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
