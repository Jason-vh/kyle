import { checkDatabaseHealth } from "@/db";

const PORT = parseInt(process.env.PORT || "3000", 10);

const server = Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);

    if (url.pathname === "/health") {
      const dbHealthy = await checkDatabaseHealth();

      if (dbHealthy) {
        return Response.json({ status: "ok", database: "connected" });
      }

      return Response.json(
        { status: "unhealthy", database: "disconnected" },
        { status: 503 }
      );
    }

    if (url.pathname === "/") {
      return Response.json({
        name: "kyle",
        version: "2.0.0",
      });
    }

    return new Response("Not Found", { status: 404 });
  },
});

console.log(`Server running on http://localhost:${server.port}`);
