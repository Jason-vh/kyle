import { afterEach, expect, test } from "bun:test";
import { downloadMovieTool } from "./tools.ts";

process.env.RADARR_HOST = "http://radarr.test";
process.env.RADARR_API_KEY = "k";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

function stubRadarr(history: unknown[]) {
  const handlers: Record<string, unknown> = {
    "/movie/1520": { id: 1520, title: "Heart of the Beast", year: 2026 },
    "/queue": { totalRecords: 0, records: [] },
    "/command": { id: 7, status: "completed", queued: "2026-11-07T17:52:11Z" },
    "/history/movie": history,
  };
  globalThis.fetch = ((url: string) => {
    for (const [fragment, body] of Object.entries(handlers)) {
      if (url.includes(fragment)) return Promise.resolve(Response.json(body));
    }
    return Promise.resolve(new Response("unexpected", { status: 500 }));
  }) as unknown as typeof fetch;
}

function grab(date: string, sourceTitle: string) {
  return { eventType: "grabbed", date, sourceTitle, quality: { quality: { name: "WEBDL-2160p" } } };
}

async function download() {
  const output = await downloadMovieTool.execute({ movieId: 1520 });
  const text = output.content[0];
  return JSON.parse(text?.type === "text" ? text.text : "{}");
}

test("download_movie reports the release its own search grabbed", async () => {
  stubRadarr([
    grab("2026-11-07T17:52:16Z", "Heart.of.the.Beast.2026.2160p.iT.WEB-DL-GTM"),
    grab("2026-11-01T09:00:00Z", "Heart.of.the.Beast.2026.TELESYNC"),
  ]);

  expect((await download()).grabbed).toEqual({
    release: "Heart.of.the.Beast.2026.2160p.iT.WEB-DL-GTM",
    quality: "WEBDL-2160p",
  });
});

test("download_movie says when its search grabbed nothing, ignoring older grabs", async () => {
  stubRadarr([grab("2026-11-01T09:00:00Z", "Heart.of.the.Beast.2026.TELESYNC")]);

  const result = await download();
  expect(result.grabbed).toBeNull();
  expect(result.message).toContain("grabbed nothing");
});
