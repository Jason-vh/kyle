import { createLogger } from "./logger.ts";
import { handleHealth } from "./routes/health.ts";
import { handleChat } from "./routes/chat.ts";
import { handleSlackEvents } from "./routes/slack-events.ts";
import { handleSonarrWebhook, handleRadarrWebhook } from "./webhooks/handler.ts";
import { handleApiThreadList, handleApiThreadDetail } from "./routes/api/threads.ts";
import { handleApiAuthStatus, handleApiLogout } from "./routes/api/auth.ts";
import {
  handlePasskeyLoginOptions,
  handlePasskeyLoginVerify,
  handlePasskeyRegisterOptions,
  handlePasskeyRegisterVerify,
} from "./routes/api/auth-passkey.ts";
import {
  handleGetInvite,
  handleInviteRegisterOptions,
  handleInviteRegisterVerify,
  handleCreateInvite,
} from "./routes/api/invites.ts";
import { handleGetUsers, handleCreateLink, handleDeleteLink } from "./routes/api/users.ts";

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
  if (
    SPA_PATHS.has(pathname) ||
    pathname.startsWith("/threads/") ||
    pathname.startsWith("/invite/")
  ) {
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

        // Auth routes
        if (req.method === "GET" && url.pathname === "/api/auth/status") {
          return await handleApiAuthStatus(req);
        }

        if (req.method === "POST" && url.pathname === "/api/auth/logout") {
          return await handleApiLogout(req);
        }

        // Passkey auth routes
        if (req.method === "POST" && url.pathname === "/api/auth/passkey/login/options") {
          return await handlePasskeyLoginOptions(req);
        }

        if (req.method === "POST" && url.pathname === "/api/auth/passkey/login/verify") {
          if (isBodyTooLarge(req)) {
            return Response.json({ error: "Payload too large" }, { status: 413 });
          }
          return await handlePasskeyLoginVerify(req);
        }

        if (req.method === "POST" && url.pathname === "/api/auth/passkey/register/options") {
          return await handlePasskeyRegisterOptions(req);
        }

        if (req.method === "POST" && url.pathname === "/api/auth/passkey/register/verify") {
          if (isBodyTooLarge(req)) {
            return Response.json({ error: "Payload too large" }, { status: 413 });
          }
          return await handlePasskeyRegisterVerify(req);
        }

        // Invite routes
        if (url.pathname.startsWith("/api/invites/")) {
          const rest = url.pathname.slice("/api/invites/".length);
          const parts = rest.split("/");
          const code = parts[0];

          if (code && parts.length === 1) {
            if (req.method === "GET") return await handleGetInvite(req, code);
          }

          if (code && parts[1] === "register" && parts[2] === "options" && req.method === "POST") {
            return await handleInviteRegisterOptions(req, code);
          }

          if (code && parts[1] === "register" && parts[2] === "verify" && req.method === "POST") {
            if (isBodyTooLarge(req)) {
              return Response.json({ error: "Payload too large" }, { status: 413 });
            }
            return await handleInviteRegisterVerify(req, code);
          }
        }

        if (req.method === "POST" && url.pathname === "/api/invites") {
          if (isBodyTooLarge(req)) {
            return Response.json({ error: "Payload too large" }, { status: 413 });
          }
          return await handleCreateInvite(req);
        }

        // User management routes
        if (req.method === "GET" && url.pathname === "/api/users") {
          return await handleGetUsers(req);
        }

        if (url.pathname.startsWith("/api/users/") && url.pathname.includes("/links")) {
          const rest = url.pathname.slice("/api/users/".length);
          const parts = rest.split("/");
          const userId = parts[0];

          if (userId && parts[1] === "links") {
            if (req.method === "POST" && parts.length === 2) {
              if (isBodyTooLarge(req)) {
                return Response.json({ error: "Payload too large" }, { status: 413 });
              }
              return await handleCreateLink(req, userId);
            }

            if (req.method === "DELETE" && parts[2]) {
              return await handleDeleteLink(req, userId, parts[2]);
            }
          }
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
