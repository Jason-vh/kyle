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
  globalThis.fetch = (async (input: string | URL | Request) => {
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
      return Response.json({ records: [], totalRecords: 0 });
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
    if (path.includes("/moviefile/"))
      return options.fileResponse ?? new Response("", { status: 404 });
    throw new Error(`Unexpected request: ${url}`);
  }) as typeof fetch;
  return { deleted, pages };
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
