import { handleHealth } from "./routes/health.ts";
import { handleChat } from "./routes/chat.ts";

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

        return Response.json({ error: "Not found" }, { status: 404 });
      } catch (error) {
        console.error("Unhandled error:", error);
        return Response.json(
          { error: "Internal server error" },
          { status: 500 }
        );
      }
    },
  });

  console.log(`Kyle is running on http://localhost:${server.port}`);
  return server;
}
