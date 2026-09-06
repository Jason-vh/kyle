import { afterEach, describe, expect, test } from "bun:test";
import { getAdditions } from "./additions.ts";

process.env.PLEX_SERVER_URL = "http://plex.test";
process.env.PLEX_SERVER_TOKEN = "t";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

const SECTIONS = [
  { key: "1", type: "movie" },
  { key: "2", type: "show" },
];

/** Plex, listing its sections and then counting each one. */
function stubPlex(sections: { key: string; type: string }[], sizes: Record<string, number>) {
  const urls: string[] = [];

  globalThis.fetch = ((url: string) => {
    urls.push(url);

    if (url.includes("/library/sections?") || url.endsWith("/library/sections")) {
      return Promise.resolve(Response.json({ MediaContainer: { Directory: sections } }));
    }

    const section = url.match(/\/sections\/(\w+)\//)?.[1];
    const type = url.match(/type=(\d+)/)?.[1];
    return Promise.resolve(
      Response.json({ MediaContainer: { size: sizes[`${section}:${type}`] ?? 0 } }),
    );
  }) as unknown as typeof fetch;

  return urls;
}

const since = new Date("2026-09-01T00:00:00Z");
const EPOCH = Math.floor(since.getTime() / 1000);

describe("getAdditions", () => {
  // Percent-encoding this makes Plex ignore the filter and count the whole
  // section, which reads as a plausible number rather than an error.
  test("sends the window filter unencoded, or Plex silently drops it", async () => {
    const urls = stubPlex(SECTIONS, {});

    await getAdditions(since);

    const counts = urls.filter((url) => url.includes("/all?"));
    expect(counts).not.toHaveLength(0);
    for (const url of counts) {
      expect(url).toContain(`addedAt>=${EPOCH}`);
      expect(url).not.toContain("%3E%3D");
    }
  });

  // Asking for none of the results still reports how many there are.
  test("asks for a count rather than the listing", async () => {
    const urls = stubPlex(SECTIONS, {});

    await getAdditions(since);

    for (const url of urls.filter((u) => u.includes("/all?"))) {
      expect(url).toContain("X-Plex-Container-Size=0");
    }
  });

  test("counts movies and episodes separately", async () => {
    stubPlex(SECTIONS, { "1:1": 5, "2:4": 108 });

    expect(await getAdditions(since)).toEqual({ movies: 5, episodes: 108 });
  });

  test("adds up sections of the same kind", async () => {
    stubPlex(
      [
        { key: "1", type: "movie" },
        { key: "3", type: "movie" },
      ],
      { "1:1": 5, "3:1": 2 },
    );

    expect(await getAdditions(since)).toEqual({ movies: 7, episodes: 0 });
  });

  // Music and photos have nothing to say about a media request.
  test("ignores a section that is neither films nor television", async () => {
    const urls = stubPlex([{ key: "4", type: "artist" }], {});

    expect(await getAdditions(since)).toEqual({ movies: 0, episodes: 0 });
    expect(urls.filter((url) => url.includes("/all?"))).toHaveLength(0);
  });

  test("reports nothing for a server with no sections at all", async () => {
    stubPlex([], {});

    expect(await getAdditions(since)).toEqual({ movies: 0, episodes: 0 });
  });
});
