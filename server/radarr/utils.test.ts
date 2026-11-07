import { describe, expect, test } from "bun:test";
import type { RadarrHistoryRecord, RadarrMovie, RadarrRelease } from "./types.ts";
import { summarizeReleases, toMovieDetails, toPartialHistoryRecord } from "./utils.ts";

const GB = 1024 ** 3;

function release(overrides: Partial<RadarrRelease>): RadarrRelease {
  return {
    guid: "g",
    title: "Heart.of.the.Beast.2026.2160p.AMZN.WEB-DL",
    quality: { quality: { name: "WEBDL-2160p" } } as RadarrRelease["quality"],
    size: 13.3 * GB,
    ageHours: 50,
    indexer: "NZBgeek (Prowlarr)",
    protocol: "usenet",
    approved: true,
    rejections: [],
    ...overrides,
  };
}

describe("summarizeReleases", () => {
  test("keeps Radarr's ranking and splits what it would take from what it would refuse", () => {
    const summary = summarizeReleases([
      release({ title: "best" }),
      release({
        title: "too big",
        approved: false,
        rejections: ["24.7 GB is larger than 18.7 GB"],
      }),
      release({ title: "second", protocol: "torrent", seeders: 1246 }),
    ]);

    expect(summary.total).toBe(3);
    expect(summary.approvedCount).toBe(2);
    expect(summary.approved.map((r) => r.title)).toEqual(["best", "second"]);
    expect(summary.rejected).toEqual([
      expect.objectContaining({ title: "too big", rejections: ["24.7 GB is larger than 18.7 GB"] }),
    ]);
  });

  test("reads size in GB, age in days, and seeders only for torrents", () => {
    const [usenet, torrent] = summarizeReleases([
      release({}),
      release({ protocol: "torrent", seeders: 12 }),
    ]).approved;

    expect(usenet).toMatchObject({ sizeGb: 13.3, ageDays: 2 });
    expect(usenet).not.toHaveProperty("seeders");
    expect(usenet).not.toHaveProperty("rejections");
    expect(torrent).toMatchObject({ seeders: 12 });
  });

  test("shows only the best few of a long list", () => {
    const summary = summarizeReleases([
      ...Array.from({ length: 20 }, () => release({})),
      ...Array.from({ length: 20 }, () => release({ approved: false, rejections: ["x"] })),
    ]);

    expect(summary.approvedCount).toBe(20);
    expect(summary.approved).toHaveLength(8);
    expect(summary.rejected).toHaveLength(5);
  });
});

test("a movie's details date each release against today", () => {
  const movie = {
    id: 1520,
    title: "Heart of the Beast",
    year: 2026,
    status: "inCinemas",
    isAvailable: false,
    minimumAvailability: "released",
    inCinemas: "2026-09-19T00:00:00Z",
    digitalRelease: "2026-11-10T00:00:00Z",
  } as RadarrMovie;

  expect(toMovieDetails(movie, "2026-11-07")).toMatchObject({
    isAvailable: false,
    minimumAvailability: "released",
    releases: {
      cinema: { date: "2026-09-19", when: "49 days ago" },
      digital: { date: "2026-11-10", when: "in 3 days" },
      physical: null,
    },
  });
});

test("a history record for one movie comes without the movie", () => {
  const record = {
    id: 1,
    sourceTitle: "Heart.of.the.Beast.2026.2160p",
    date: "2026-11-07T14:00:00Z",
    eventType: "grabbed",
    quality: { quality: { name: "WEBDL-2160p" } },
  } as RadarrHistoryRecord;

  expect(toPartialHistoryRecord(record)).toEqual({
    id: 1,
    sourceTitle: "Heart.of.the.Beast.2026.2160p",
    date: "2026-11-07T14:00:00Z",
    eventType: "grabbed",
    quality: "WEBDL-2160p",
  });
});
