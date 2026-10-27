import { afterEach, expect, test } from "bun:test";
import { sweep } from "./run.ts";

const realFetch = globalThis.fetch;
const previousEnv = { ...process.env };

afterEach(() => {
  globalThis.fetch = realFetch;
  for (const key of Object.keys(process.env)) {
    if (!(key in previousEnv)) delete process.env[key];
  }
  Object.assign(process.env, previousEnv);
});

function services(
  options: {
    fileId?: unknown;
    fileResponse?: Response;
    historyTruncated?: boolean;
    importOnSecondPage?: boolean;
    queuedOnSecondPage?: boolean;
    series?: unknown[];
    seriesQueue?: unknown[];
  } = {},
) {
  Object.assign(process.env, {
    RADARR_HOST: "http://radarr.test",
    RADARR_API_KEY: "test",
    SONARR_HOST: "http://sonarr.test",
    SONARR_API_KEY: "test",
    QBITTORRENT_HOST: "http://qbit.test",
    QBITTORRENT_USERNAME: "test",
    QBITTORRENT_PASSWORD: "test",
  });
  const deleted: string[] = [];
  const pages: string[] = [];
  const removedFromQueue: string[] = [];
  const commands: unknown[] = [];
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    const path = url.pathname;
    const page = Number(url.searchParams.get("page") ?? "1");
    if (path.endsWith("/auth/login")) {
      return new Response("Ok.", { headers: { "set-cookie": "SID=test" } });
    }
    if (path.endsWith("/torrents/info")) {
      return Response.json([{ hash: "abc", name: "A Film", size: 1000, completion_on: 1 }]);
    }
    if (path.endsWith("/torrents/delete")) {
      deleted.push(path);
      return new Response("");
    }
    if (path.endsWith("/queue")) {
      pages.push(`${url.hostname}:queue:${page}`);
      if (url.hostname === "radarr.test" && options.queuedOnSecondPage) {
        return Response.json({
          records: [{ id: page, downloadId: page === 2 ? "abc" : "other", title: "A Film" }],
          totalRecords: 2,
        });
      }
      if (url.hostname === "sonarr.test" && options.seriesQueue) {
        const records = page === 1 ? options.seriesQueue : [];
        return Response.json({ records, totalRecords: options.seriesQueue.length });
      }
      return Response.json({ records: [], totalRecords: 0 });
    }
    if (path.includes("/queue/") && init?.method === "DELETE") {
      removedFromQueue.push(`${url.hostname}${path}?${url.searchParams}`);
      return new Response("");
    }
    if (path.endsWith("/command")) {
      commands.push(JSON.parse(String(init?.body)));
      return Response.json({ id: 1 });
    }
    if (path.endsWith("/history")) {
      pages.push(`${url.hostname}:history:${page}`);
      if (url.hostname === "sonarr.test") return Response.json({ records: [], totalRecords: 0 });
      if (options.importOnSecondPage) {
        return Response.json({
          records: [
            {
              id: page,
              eventType: page === 1 ? "grabbed" : "downloadFolderImported",
              data: { fileId: options.fileId },
            },
          ],
          totalRecords: 2,
        });
      }
      const records = [
        { id: 1, eventType: "downloadFolderImported", data: { fileId: options.fileId } },
      ];
      return Response.json({
        records: page === 1 ? records : [],
        totalRecords: options.historyTruncated ? 2 : 1,
      });
    }
    if (path.endsWith("/movie")) return Response.json([]);
    if (path.endsWith("/series")) return Response.json(options.series ?? []);
    if (path.includes("/moviefile/"))
      return options.fileResponse ?? new Response("", { status: 404 });
    throw new Error(`Unexpected request: ${url}`);
  }) as typeof fetch;
  return { deleted, pages, removedFromQueue, commands };
}

test.each([undefined, "bad", "12garbage", 0, -1, 1.5])(
  "never deletes when an import lacks a valid file id: %s",
  async (fileId) => {
    const { deleted } = services({ fileId });
    await expect(sweep(true)).rejects.toThrow("valid file id");
    expect(deleted).toEqual([]);
  },
);

test("never deletes from truncated history", async () => {
  const { deleted } = services({ fileId: 12, historyTruncated: true });
  await expect(sweep(true)).rejects.toThrow("Incomplete");
  expect(deleted).toEqual([]);
});

test("finds active downloads beyond the first queue page", async () => {
  const { deleted, pages } = services({ fileId: "12", queuedOnSecondPage: true });
  const report = await sweep(true);
  expect(pages).toContain("radarr.test:queue:2");
  expect(report.actions).toEqual([]);
  expect(deleted).toEqual([]);
});

test("keeps live imports found beyond the first history page", async () => {
  const { deleted, pages } = services({
    fileId: 12,
    importOnSecondPage: true,
    fileResponse: Response.json({ id: 12 }),
  });
  expect((await sweep(true)).actions).toEqual([]);
  expect(pages).toContain("radarr.test:history:2");
  expect(deleted).toEqual([]);
});

test("never treats an empty successful file response as a missing file", async () => {
  const { deleted } = services({ fileId: 12, fileResponse: new Response("") });
  await expect(sweep(true)).rejects.toThrow("Invalid movie file response");
  expect(deleted).toEqual([]);
});

test("deletes only after the file endpoint confirms absence", async () => {
  const { deleted } = services({ fileId: 12 });
  expect((await sweep(true)).applied).toBe(1);
  expect(deleted).toHaveLength(1);
});

function show(id: number, overrides: Record<string, unknown>) {
  return {
    id,
    title: `Show ${id}`,
    monitored: true,
    monitorNewItems: "none",
    seasons: [{ seasonNumber: 1, monitored: false }],
    statistics: { episodeFileCount: 0 },
    added: "2020-01-01T00:00:00Z",
    ...overrides,
  };
}

test("removes a series only when nothing in it is monitored or followed", async () => {
  services({
    fileId: 12,
    fileResponse: Response.json({ id: 12 }),
    series: [
      show(1, {}),
      show(2, { monitored: false, monitorNewItems: "all" }),
      show(3, { monitorNewItems: "all" }),
      show(4, { seasons: [{ seasonNumber: 1, monitored: true }] }),
      show(5, { statistics: { episodeFileCount: 3 } }),
    ],
  });

  const removed = (await sweep(false)).actions
    .filter((action) => action.kind === "remove-media")
    .map((action) => action.subject);

  expect(removed).toEqual(["Show 1", "Show 2"]);
});

function queued(episodeId: number, overrides: Record<string, unknown>) {
  return {
    id: episodeId,
    seriesId: 591,
    episodeId,
    series: { id: 591, title: "The Block" },
    title: "The.Block.S22E49.720p",
    downloadId: "SABnzbd_nzo_49",
    size: 1000,
    sizeleft: 1000,
    added: "2020-01-01T00:00:00Z",
    status: "warning",
    trackedDownloadStatus: "warning",
    trackedDownloadState: "downloading",
    errorMessage: "The download is stalled",
    ...overrides,
  };
}

test("retries a stalled download once, searching only the episodes it carried", async () => {
  const { removedFromQueue, commands } = services({
    fileId: 12,
    fileResponse: Response.json({ id: 12 }),
    seriesQueue: [queued(101, {}), queued(102, {})],
  });

  await sweep(true);

  expect(removedFromQueue).toEqual([
    "sonarr.test/api/v3/queue/101?removeFromClient=true&blocklist=true&skipRedownload=true",
  ]);
  expect(commands).toEqual([{ name: "EpisodeSearch", episodeIds: [101, 102] }]);
});

test("leaves downloads in a paused client alone, however long they wait", async () => {
  const { removedFromQueue, commands } = services({
    fileId: 12,
    fileResponse: Response.json({ id: 12 }),
    seriesQueue: [
      queued(101, { status: "paused", trackedDownloadStatus: "ok", errorMessage: undefined }),
    ],
  });

  const report = await sweep(true);

  expect(report.actions).toEqual([]);
  expect(removedFromQueue).toEqual([]);
  expect(commands).toEqual([]);
});
