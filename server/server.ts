import { createLogger } from "./logger.ts";
import { withSessionRefresh } from "./auth/middleware.ts";
import { withAuthenticationLimit } from "./http/rate-limit.ts";
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
import { handleGetMediaActivity, handleGetMediaDetail } from "./routes/api/media.ts";
import { handleGetDashboard } from "./routes/api/dashboard.ts";
import { handleGetNotifications, handleMarkNotificationsRead } from "./routes/api/notifications.ts";

const log = createLogger("server");

const MAX_BODY_SIZE = 1_000_000; // 1 MB

const WEB_DIST = "web/dist";

/** A hashed asset never changes; everything else is revalidated every time. */
async function serveAsset(pathname: string): Promise<Response | null> {
  const file = Bun.file(`${WEB_DIST}${pathname}`);
  if (!(await file.exists())) return null;

  const immutable = pathname.startsWith("/assets/");
  return new Response(file, {
    headers: {
      "Cache-Control": immutable ? "public, max-age=31536000, immutable" : "no-cache",
    },
  });
}

/** The built app, which routes the path itself once the browser has it. */
async function serveApp(): Promise<Response | null> {
  const indexFile = Bun.file(`${WEB_DIST}/index.html`);
  if (!(await indexFile.exists())) return null;

  return new Response(indexFile, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-cache",
    },
  });
}

/**
 * A navigation, rather than a fetch for an asset that is no longer there. Only
 * a navigation is worth answering with the app; anything else wanting a file
 * we do not have deserves to hear so.
 */
function isNavigation(req: Request): boolean {
  return req.headers.get("accept")?.includes("text/html") ?? false;
}

/**
 * The top-level names the server answers under, read off the routes it
 * declares. Anything below one of them is the server's to answer or to refuse,
 * so an unknown `/api/…` is a 404 rather than the app; everything else is the
 * client's, which therefore never has to be listed here to be reachable.
 */
function serverOwnedPaths(routes: Record<string, unknown>): (pathname: string) => boolean {
  const namespaces = new Set(Object.keys(routes).map((route) => route.split("/")[1]));
  return (pathname) => namespaces.has(pathname.split("/")[1]);
}

/** Identity, but it keeps each route's path type, so `req.params` stays typed. */
function defineRoutes<const R extends string>(routes: Bun.Serve.Routes<undefined, R>) {
  return routes;
}

export function startServer(port: number) {
  const routes = defineRoutes({
    "/health": { GET: handleHealth },

    // --- API routes ---
    "/api/threads": { GET: withSessionRefresh(handleApiThreadList) },
    "/api/threads/:id": {
      GET: (req) => withSessionRefresh(handleApiThreadDetail)(req, req.params.id),
    },

    "/api/auth/status": { GET: withSessionRefresh(handleApiAuthStatus) },
    "/api/auth/logout": { POST: withSessionRefresh(handleApiLogout) },
    "/api/auth/passkey/login/options": {
      POST: withAuthenticationLimit(handlePasskeyLoginOptions),
    },
    "/api/auth/passkey/login/verify": { POST: withAuthenticationLimit(handlePasskeyLoginVerify) },
    "/api/auth/passkey/register/options": {
      POST: withSessionRefresh(handlePasskeyRegisterOptions),
    },
    "/api/auth/passkey/register/verify": {
      POST: withSessionRefresh(handlePasskeyRegisterVerify),
    },
    "/api/auth/plex/login/start": { POST: withAuthenticationLimit(handlePlexLoginStart) },
    "/api/auth/plex/link/start": { POST: withSessionRefresh(handlePlexLinkStart) },
    "/api/auth/plex/link": { DELETE: withSessionRefresh(handlePlexUnlink) },
    "/api/auth/plex/callback": { GET: withAuthenticationLimit(handlePlexCallback) },

    "/api/library": { GET: withSessionRefresh(handleGetLibrary) },
    "/api/media/:mediaType/:tmdbId": {
      GET: (req) =>
        withSessionRefresh(handleGetMediaDetail)(req, req.params.mediaType, req.params.tmdbId),
    },
    "/api/media/:mediaType/:tmdbId/activity": {
      GET: (req) =>
        withSessionRefresh(handleGetMediaActivity)(req, req.params.mediaType, req.params.tmdbId),
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
        withSessionRefresh(handleReleaseSeason)(req, req.params.serviceId, req.params.seasonNumber),
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
  });

  const isServerOwned = serverOwnedPaths(routes);

  const server = Bun.serve({
    port,
    maxRequestBodySize: MAX_BODY_SIZE,
    routes,

    // Anything unrouted is either a built web asset, the app itself, or a miss.
    async fetch(req) {
      const url = new URL(req.url);

      if (req.method === "GET" || req.method === "HEAD") {
        const asset = await serveAsset(url.pathname);
        if (asset) return asset;

        if (!isServerOwned(url.pathname) && isNavigation(req)) {
          const app = await serveApp();
          if (app) return app;
        }
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
