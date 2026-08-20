import { describe, expect, test } from "bun:test";
import { __testing } from "./service.ts";
import type { RadarrMovie } from "../radarr/types.ts";
import type { SonarrSeries } from "../sonarr/types.ts";

const { toMovie, toSeries, seriesAvailability } = __testing;

const movie = {
  id: 1417,
  tmdbId: 454639,
  title: "Masters of the Universe",
  year: 2026,
  monitored: true,
  hasFile: true,
  sizeOnDisk: 4640172090,
  images: [
    { coverType: "fanart", remoteUrl: "https://img/fan.jpg" },
    { coverType: "poster", remoteUrl: "https://img/poster.jpg" },
  ],
} as unknown as RadarrMovie;

function series(overrides: Record<string, unknown> = {}) {
  return {
    id: 479,
    tmdbId: 33852,
    title: "Lost Girl",
    year: 2010,
    monitored: true,
    statistics: { episodeFileCount: 0, episodeCount: 13, sizeOnDisk: 0 },
    images: [{ coverType: "poster", remoteUrl: "https://img/series.jpg" }],
    ...overrides,
  } as unknown as SonarrSeries;
}

describe("toMovie", () => {
  test("takes the poster from the images array", () => {
    expect(toMovie(movie).posterUrl).toBe("https://img/poster.jpg");
  });

  test("a movie with its file is available", () => {
    expect(toMovie(movie).availability).toBe("available");
  });

  test("a movie without its file is missing", () => {
    expect(toMovie({ ...movie, hasFile: false }).availability).toBe("missing");
  });

  test("drops the year Radarr reports as 0", () => {
    expect(toMovie({ ...movie, year: 0 }).year).toBeUndefined();
  });
});

describe("seriesAvailability", () => {
  test("nothing on disk is missing", () => {
    expect(seriesAvailability(0, 13)).toBe("missing");
  });

  test("some episodes on disk is partial", () => {
    expect(seriesAvailability(4, 13)).toBe("partial");
  });

  test("every episode on disk is available", () => {
    expect(seriesAvailability(13, 13)).toBe("available");
  });

  test("more files than counted episodes still reads as available", () => {
    expect(seriesAvailability(14, 13)).toBe("available");
  });
});

describe("toSeries", () => {
  test("reports episode progress", () => {
    const item = toSeries(series({ statistics: { episodeFileCount: 4, episodeCount: 13 } }));

    expect(item.detail).toBe("4/13 episodes");
    expect(item.availability).toBe("partial");
  });

  test("says nothing about progress for a series with no episodes counted", () => {
    expect(
      toSeries(series({ statistics: { episodeFileCount: 0, episodeCount: 0 } })).detail,
    ).toBeUndefined();
  });

  test("survives a series with no statistics at all", () => {
    const item = toSeries(series({ statistics: undefined }));

    expect(item.availability).toBe("missing");
    expect(item.sizeOnDisk).toBe(0);
  });
});

describe("annotateRequesters", () => {
  const items = () => [
    { ...toMovie(movie), tmdbId: 454639 },
    { ...toSeries(series()), tmdbId: 33852 },
  ];

  test("names requesters and flags the viewer's own", () => {
    const list = items();
    __testing.annotateRequesters(list, "me", [
      { mediaType: "movie", tmdbId: 454639, userId: "me", name: "Jason" },
      { mediaType: "movie", tmdbId: 454639, userId: "u2", name: "Bonita" },
    ]);

    expect(list[0]!.requestedBy).toEqual(["Jason", "Bonita"]);
    expect(list[0]!.requestedByMe).toBe(true);
    expect(list[1]!.requestedBy).toEqual([]);
  });

  test("someone else's request is not mine", () => {
    const list = items();
    __testing.annotateRequesters(list, "me", [
      { mediaType: "series", tmdbId: 33852, userId: "u2", name: "Bonita" },
    ]);

    expect(list[1]!.requestedBy).toEqual(["Bonita"]);
    expect(list[1]!.requestedByMe).toBe(false);
  });

  test("a request does not attach to the other media type with the same id", () => {
    const list = items();
    __testing.annotateRequesters(list, "me", [
      { mediaType: "series", tmdbId: 454639, userId: "me", name: "Jason" },
    ]);

    expect(list[0]!.requestedBy).toEqual([]);
  });
});
