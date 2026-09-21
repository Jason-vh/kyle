import { afterEach, expect, test } from "bun:test";
import { verifyDeployment } from "./healthcheck.ts";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function healthResponse(body: unknown, status = 200) {
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    expect(url).toBe("http://localhost:3000/health");
    expect(init.signal).toBeInstanceOf(AbortSignal);
    return Response.json(body, { status });
  }) as unknown as typeof fetch;
}

test("accepts only a healthy instance of the expected deployment", async () => {
  healthResponse({ status: "healthy", deployId: "expected" });
  await verifyDeployment("http://localhost:3000/health", "expected");
});

test.each([
  [{ status: "degraded", deployId: "expected" }, 503, "Health check returned 503"],
  [{ status: "degraded", deployId: "expected" }, 200, "Application is not healthy"],
  [{ status: "healthy", deployId: "old" }, 200, "Expected deployment expected, received old"],
  [{ status: "healthy" }, 200, "Expected deployment expected, received undefined"],
] as const)("rejects an unhealthy or outdated deployment: %j", async (body, status, error) => {
  healthResponse(body, status);
  await expect(verifyDeployment("http://localhost:3000/health", "expected")).rejects.toThrow(error);
});

test("network failures fail deployment verification", async () => {
  globalThis.fetch = (async () => {
    throw new Error("Connection refused");
  }) as unknown as typeof fetch;
  await expect(verifyDeployment("http://localhost:3000/health", "expected")).rejects.toThrow(
    "Connection refused",
  );
});

test("CI and every Docker stage use the same pinned Bun version", async () => {
  const version = (await Bun.file(".bun-version").text()).trim();
  const dockerfile = await Bun.file("Dockerfile").text();
  const workflow = await Bun.file(".github/workflows/deploy.yml").text();
  expect(version).toMatch(/^\d+\.\d+\.\d+$/);
  expect(dockerfile).toContain(`ARG BUN_VERSION=${version}\n`);
  expect(dockerfile.match(/^FROM .+$/gm)).toEqual([
    "FROM oven/bun:${BUN_VERSION} AS web-build",
    "FROM oven/bun:${BUN_VERSION} AS server-deps",
    "FROM oven/bun:${BUN_VERSION}",
  ]);
  expect(workflow).toContain("bun-version-file: .bun-version");
});
