import { createLogger } from "./logger.ts";
import { withSessionRefresh } from "./auth/middleware.ts";
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
  handlePlexLoginStart,
  handlePlexLinkStart,
  handlePlexUnlink,
  handlePlexCallback,
} from "./routes/api/auth-plex.ts";
import { handleGetUsers, handleCreateLink, handleDeleteLink } from "./routes/api/users.ts";
import {
  handleCreatePlexInvite,
  handleGetPlexMembers,
  handleRemovePlexMember,
} from "./routes/api/plex-members.ts";
import {
  handleDiscoverSearch,
  handleCreateRequest,
  handleGetRequests,
  handleReportRequest,
  handleRetryRequest,
} from "./routes/api/requests.ts";
import {
  handleGetLibrary,
  handleReleaseSeason,
  handleRemoveLibraryItem,
} from "./routes/api/library.ts";
import { handleGetMediaDetail } from "./routes/api/media.ts";
import { handleGetDashboard } from "./routes/api/dashboard.ts";
import { handleGetNotifications, handleMarkNotificationsRead } from "./routes/api/notifications.ts";

const log = createLogger("server");

const MAX_BODY_SIZE = 1_000_000; // 1 MB

const SPA_PATHS = new Set([
  "/",
  "/threads",
  "/threads/",
  "/login",
  "/account",
  "/members",
  "/discover",
  "/requests",
  "/library",
  "/home",
]);

/** Client routes carrying an id, matched by their prefix instead. */
const SPA_PREFIXES = ["/threads/", "/media/"];
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
    SPA_PATHS.has(pathname) || SPA_PREFIXES.some((prefix) => pathname.startsWith(prefix));
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
      "/api/threads": { GET: withSessionRefresh(handleApiThreadList) },
      "/api/threads/:id": {
        GET: (req) => withSessionRefresh(handleApiThreadDetail)(req, req.params.id),
      },

      "/api/auth/status": { GET: withSessionRefresh(handleApiAuthStatus) },
      "/api/auth/logout": { POST: withSessionRefresh(handleApiLogout) },
      "/api/auth/passkey/login/options": { POST: handlePasskeyLoginOptions },
      "/api/auth/passkey/login/verify": { POST: handlePasskeyLoginVerify },
      "/api/auth/passkey/register/options": {
        POST: withSessionRefresh(handlePasskeyRegisterOptions),
      },
      "/api/auth/passkey/register/verify": {
        POST: withSessionRefresh(handlePasskeyRegisterVerify),
      },
      "/api/auth/plex/login/start": { POST: handlePlexLoginStart },
      "/api/auth/plex/link/start": { POST: withSessionRefresh(handlePlexLinkStart) },
      "/api/auth/plex/link": { DELETE: withSessionRefresh(handlePlexUnlink) },
      "/api/auth/plex/callback": { GET: handlePlexCallback },

      "/api/library": { GET: withSessionRefresh(handleGetLibrary) },
      "/api/media/:mediaType/:tmdbId": {
        GET: (req) =>
          withSessionRefresh(handleGetMediaDetail)(req, req.params.mediaType, req.params.tmdbId),
      },
      "/api/library/:mediaType/:serviceId": {
        DELETE: (req) =>
          withSessionRefresh(handleRemoveLibraryItem)(
            req,
            req.params.mediaType,
            req.params.serviceId,
          ),
      },
      "/api/library/series/:serviceId/seasons/:seasonNumber": {
        DELETE: (req) =>
          withSessionRefresh(handleReleaseSeason)(
            req,
            req.params.serviceId,
            req.params.seasonNumber,
          ),
      },

      "/api/dashboard": { GET: withSessionRefresh(handleGetDashboard) },

      "/api/notifications": { GET: withSessionRefresh(handleGetNotifications) },
      "/api/notifications/read": { POST: withSessionRefresh(handleMarkNotificationsRead) },

      "/api/discover": { GET: withSessionRefresh(handleDiscoverSearch) },
      "/api/requests": {
        GET: withSessionRefresh(handleGetRequests),
        POST: withSessionRefresh(handleCreateRequest),
      },
      "/api/requests/:mediaType/:tmdbId/retry": {
        POST: (req) =>
          withSessionRefresh(handleRetryRequest)(req, req.params.mediaType, req.params.tmdbId),
      },
      "/api/requests/:mediaType/:tmdbId/report": {
        POST: (req) =>
          withSessionRefresh(handleReportRequest)(req, req.params.mediaType, req.params.tmdbId),
      },

      "/api/plex/members": { GET: withSessionRefresh(handleGetPlexMembers) },
      "/api/plex/members/:handle": {
        DELETE: (req) => withSessionRefresh(handleRemovePlexMember)(req, req.params.handle),
      },
      "/api/plex/invites": { POST: withSessionRefresh(handleCreatePlexInvite) },

      "/api/users": { GET: withSessionRefresh(handleGetUsers) },
      "/api/users/:userId/links": {
        POST: (req) => withSessionRefresh(handleCreateLink)(req, req.params.userId),
      },
      "/api/users/:userId/links/:linkId": {
        DELETE: (req) =>
          withSessionRefresh(handleDeleteLink)(req, req.params.userId, req.params.linkId),
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
