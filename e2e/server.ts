process.env.DATABASE_URL = "pglite://";
process.env.JWT_SECRET = "isolated-browser-tests-only-secret";
process.env.NODE_ENV = "production";
process.env.PUBLIC_ORIGIN = "http://localhost:4173";
process.env.WEBAUTHN_ORIGIN = "http://localhost:4173";
process.env.WEBAUTHN_RP_ID = "localhost";
for (const name of [
  "PLEX_CLIENT_IDENTIFIER",
  "PLEX_SERVER_URL",
  "PLEX_SERVER_TOKEN",
  "CHAT_API_KEY",
  "CHAT_USER_ID",
  "WEBHOOK_AUTH",
  "ULTRA_HOST",
  "ULTRA_API_TOKEN",
  "ANTHROPIC_API_KEY",
  "SLACK_BOT_TOKEN",
  "SLACK_SIGNING_SECRET",
  "DISCORD_BOT_TOKEN",
  "BRAVE_API_KEY",
  "QBITTORRENT_HOST",
  "QBITTORRENT_USERNAME",
  "QBITTORRENT_PASSWORD",
]) {
  delete process.env[name];
}
for (const service of ["RADARR", "SONARR"]) {
  process.env[`${service}_HOST`] = `http://${service.toLowerCase()}.test`;
  process.env[`${service}_API_KEY`] = "test-only";
}
process.env.TMDB_API_TOKEN = "test-only";

const arrival = {
  id: 7,
  tmdbId: 329865,
  title: "Arrival",
  year: 2016,
  monitored: true,
  hasFile: false,
  status: "released",
  images: [],
  sizeOnDisk: 0,
  digitalRelease: "2016-11-11",
};
let held = false;
globalThis.fetch = (async (input: string | URL | Request, init: RequestInit = {}) => {
  const url = new URL(input instanceof Request ? input.url : input);
  const path = url.pathname;
  if (path.endsWith("/search/multi")) {
    return Response.json({
      results: [
        {
          id: arrival.tmdbId,
          media_type: "movie",
          title: arrival.title,
          release_date: "2016-11-11",
          overview: "A linguist meets visitors.",
          poster_path: null,
        },
      ],
    });
  }
  if (path.endsWith(`/movie/${arrival.tmdbId}`)) {
    return Response.json({
      id: arrival.tmdbId,
      title: arrival.title,
      release_date: "2016-11-11",
      overview: "A linguist meets visitors.",
      poster_path: null,
      backdrop_path: null,
      runtime: 116,
      genres: [],
      vote_count: 0,
      vote_average: 0,
      status: "Released",
    });
  }
  if (path.endsWith("/movie/lookup/tmdb")) return Response.json(arrival);
  if (path.endsWith("/movie/7")) {
    if (init.method === "DELETE") held = false;
    return Response.json(arrival);
  }
  if (path.endsWith("/movie")) {
    if (init.method === "POST") {
      held = true;
      return Response.json(arrival);
    }
    return Response.json(held ? [arrival] : []);
  }
  if (path.endsWith("/qualityprofile")) return Response.json([{ id: 1 }]);
  if (path.endsWith("/rootfolder")) return Response.json([{ path: "/media", freeSpace: 1000 }]);
  if (path.endsWith("/series") || path.endsWith("/diskspace")) return Response.json([]);
  if (path.endsWith("/history") || path.endsWith("/queue"))
    return Response.json({ records: [], totalRecords: 0 });
  return new Response("Unexpected test upstream", { status: 503 });
}) as unknown as typeof fetch;

const { db } = await import("../server/db/index.ts");
const { users } = await import("../server/db/schema.ts");
const { signJwt } = await import("../server/auth/jwt.ts");
const sessions: Record<string, string> = {};
for (const name of ["member", "requester", "bystander", "admin"]) {
  const admin = name === "admin";
  const [user] = await db.insert(users).values({ displayName: name, isAdmin: admin }).returning();
  sessions[name] = await signJwt({ id: user!.id, name, admin });
}
await Bun.write(".e2e/sessions.json", JSON.stringify(sessions));
const { startServer } = await import("../server/server.ts");
startServer(4173);

export {};
