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

const SPA_PATHS = new Set(["/", "/threads", "/threads/", "/login"]);
const WEB_DIST = "web/dist";

/** Serves a built asset, falling back to index.html for client-routed paths. */
async function serveSpaFile(pathname: string): Promise<Response | null> {
  const file = Bun.file(`${WEB_DIST}${pathname}`);
  if (await file.exists()) {
    return new Response(file, {
      headers: {
        "Cache-Control": pathname.startsWith("/assets/")
          ? "public, max-age=31536000, immutable"
          : "no-cache",
      },
    });
  }

  const isSpaRoute =
    SPA_PATHS.has(pathname) || pathname.startsWith("/threads/") || pathname.startsWith("/invite/");
  if (!isSpaRoute) return null;

  const indexFile = Bun.file(`${WEB_DIST}/index.html`);
  if (!(await indexFile.exists())) return null;

  return new Response(indexFile, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-cache",
    },
  });
}

export function startServer(port: number) {
  const server = Bun.serve({
    port,
    maxRequestBodySize: MAX_BODY_SIZE,

    routes: {
      "/health": { GET: handleHealth },

      // --- API routes ---
      "/api/threads": { GET: handleApiThreadList },
      "/api/threads/:id": { GET: (req) => handleApiThreadDetail(req, req.params.id) },

      "/api/auth/status": { GET: handleApiAuthStatus },
      "/api/auth/logout": { POST: handleApiLogout },
      "/api/auth/passkey/login/options": { POST: handlePasskeyLoginOptions },
      "/api/auth/passkey/login/verify": { POST: handlePasskeyLoginVerify },
      "/api/auth/passkey/register/options": { POST: handlePasskeyRegisterOptions },
      "/api/auth/passkey/register/verify": { POST: handlePasskeyRegisterVerify },

      "/api/invites": { POST: handleCreateInvite },
      "/api/invites/:code": { GET: (req) => handleGetInvite(req, req.params.code) },
      "/api/invites/:code/register/options": {
        POST: (req) => handleInviteRegisterOptions(req, req.params.code),
      },
      "/api/invites/:code/register/verify": {
        POST: (req) => handleInviteRegisterVerify(req, req.params.code),
      },

      "/api/users": { GET: handleGetUsers },
      "/api/users/:userId/links": { POST: (req) => handleCreateLink(req, req.params.userId) },
      "/api/users/:userId/links/:linkId": {
        DELETE: (req) => handleDeleteLink(req, req.params.userId, req.params.linkId),
      },

      // --- Service routes ---
      "/chat": { POST: handleChat },
      "/slack/events": { POST: handleSlackEvents },
      "/webhooks/sonarr": { POST: handleSonarrWebhook },
      "/webhooks/radarr": { POST: handleRadarrWebhook },
    },

    // Anything unrouted is either a built web asset or a miss.
    async fetch(req) {
      const url = new URL(req.url);

      if (req.method === "GET" || req.method === "HEAD") {
        const spaResponse = await serveSpaFile(url.pathname);
        if (spaResponse) return spaResponse;
      }

      log.warn("not found", { method: req.method, path: url.pathname });
      return Response.json({ error: "Not found" }, { status: 404 });
    },

    error(error) {
      log.error("unhandled error", { error: error.message, stack: error.stack });
      return Response.json({ error: "Internal server error" }, { status: 500 });
    },
  });

  log.info("server started", { port: server.port });
  return server;
}
