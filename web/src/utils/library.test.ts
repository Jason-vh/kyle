import { describe, expect, test } from "vitest";
import type { LibraryItem } from "#web/api/library";
import {
  applyLibraryView,
  changedFilters,
  downloadStatus,
  DEFAULT_LIBRARY_VIEW,
  filterLabel,
  librarySummary,
  viewFromQuery,
  viewToQuery,
  watchedLabel,
} from "./library";

const item = (overrides: Partial<LibraryItem>): LibraryItem => ({
  mediaType: "movie",
  serviceId: 1,
  title: "Arrival",
  monitored: true,
  sizeOnDisk: 0,
  availability: "available",
  requestedBy: [],
  requestedByMe: false,
  watchedBy: [],
  ...overrides,
});

const arrival = item({ title: "Arrival", sizeOnDisk: 20 });
const boys = item({
  title: "The Boys",
  mediaType: "series",
  sizeOnDisk: 300,
  availability: "partial",
});
const dune = item({
  title: "Dune",
  sizeOnDisk: 60,
  requestedByMe: true,
  watchedBy: [{ name: "Sue" }],
});
const inception = item({ title: "Inception", availability: "missing" });
const library = [arrival, dune, inception, boys];

const titles = (items: LibraryItem[]) => items.map((shown) => shown.title);

describe("applyLibraryView", () => {
  test("keeps the order it was given by default", () => {
    expect(titles(applyLibraryView(library, DEFAULT_LIBRARY_VIEW))).toEqual(titles(library));
  });

  test("puts the largest first when sorting by size", () => {
    const shown = applyLibraryView(library, { ...DEFAULT_LIBRARY_VIEW, sort: "size" });
    expect(titles(shown)).toEqual(["The Boys", "Dune", "Arrival", "Inception"]);
  });

  test("matches the search anywhere in the title, ignoring case", () => {
    const shown = applyLibraryView(library, { ...DEFAULT_LIBRARY_VIEW, search: " BOY " });
    expect(titles(shown)).toEqual(["The Boys"]);
  });

  test("combines filters", () => {
    const shown = applyLibraryView(library, {
      ...DEFAULT_LIBRARY_VIEW,
      type: "movie",
      availability: "available",
    });
    expect(titles(shown)).toEqual(["Arrival", "Dune"]);
  });

  test("shows only what the viewer requested", () => {
    const shown = applyLibraryView(library, { ...DEFAULT_LIBRARY_VIEW, requestedByMe: true });
    expect(titles(shown)).toEqual(["Dune"]);
  });

  test("counts nothing on disk as neither watched nor unwatched", () => {
    const shown = applyLibraryView(library, { ...DEFAULT_LIBRARY_VIEW, unwatched: true });
    expect(titles(shown)).toEqual(["Arrival", "The Boys"]);
  });
});

describe("changedFilters", () => {
  test("is empty for the default view, whatever the search", () => {
    expect(changedFilters({ ...DEFAULT_LIBRARY_VIEW, search: "dune" })).toEqual([]);
  });

  test("names each filter moved off its default", () => {
    const view = { ...DEFAULT_LIBRARY_VIEW, sort: "size" as const, unwatched: true };
    expect(changedFilters(view)).toEqual(["sort", "unwatched"]);
  });
});

describe("filterLabel", () => {
  test("describes the chosen value", () => {
    const view = { ...DEFAULT_LIBRARY_VIEW, sort: "size" as const, type: "series" as const };
    expect(filterLabel("sort", view)).toBe("Largest first");
    expect(filterLabel("type", view)).toBe("Series");
  });
});

describe("the view in the URL", () => {
  test("leaves defaults out, so the plain page has a plain address", () => {
    expect(viewToQuery(DEFAULT_LIBRARY_VIEW)).toEqual({});
  });

  test("survives a round trip", () => {
    const view = {
      search: "boys",
      sort: "size" as const,
      type: "series" as const,
      availability: "partial" as const,
      requestedByMe: true,
      unwatched: true,
    };
    expect(viewFromQuery(viewToQuery(view))).toEqual(view);
  });

  test("falls back to defaults for anything it does not recognise", () => {
    expect(viewFromQuery({ sort: "rating", type: "anime", mine: "yes" })).toEqual(
      DEFAULT_LIBRARY_VIEW,
    );
  });

  test("reads the first of a repeated key", () => {
    expect(viewFromQuery({ type: ["movie", "series"] }).type).toBe("movie");
  });
});

describe("librarySummary", () => {
  const GB = 1000 ** 3;

  test("gives the type and the size on disk", () => {
    expect(librarySummary(item({ sizeOnDisk: 19 * GB }))).toBe("Movie · 19 GB");
  });

  test("counts the episodes of a complete series", () => {
    const series = item({
      mediaType: "series",
      sizeOnDisk: 321 * GB,
      episodes: { present: 103, total: 103 },
    });
    expect(librarySummary(series)).toBe("Series · 321 GB · 103 episodes");
  });

  test("leaves the count of an incomplete series to be shown on its own", () => {
    const series = item({
      mediaType: "series",
      availability: "partial",
      episodes: { present: 34, total: 93 },
    });
    expect(librarySummary(series)).toBe("Series");
  });
});

describe("watchedLabel", () => {
  const sue = { name: "Sue" };
  const bob = { name: "Bob" };

  test("says so when nobody has watched", () => {
    expect(watchedLabel([])).toBe("Not watched yet");
  });

  test("names one or two people", () => {
    expect(watchedLabel([sue])).toBe("Watched by Sue");
    expect(watchedLabel([sue, bob])).toBe("Watched by Sue and Bob");
  });

  test("counts any more than that", () => {
    expect(watchedLabel([sue, bob, { name: "Ann" }])).toBe("Watched by 3 people");
  });
});

describe("downloadStatus", () => {
  test("says nothing about a title that is all there", () => {
    expect(downloadStatus(item({}))).toBeUndefined();
  });

  test("calls a title with nothing on disk and nothing queued not downloaded", () => {
    expect(downloadStatus(item({ availability: "missing" }))).toEqual({
      label: "Not downloaded",
      tone: "red",
      downloading: false,
    });
  });

  test("gives how far along a download is", () => {
    const downloading = item({
      availability: "missing",
      download: { state: "downloading", progress: 0.424 },
    });
    expect(downloadStatus(downloading)).toEqual({
      label: "42%",
      tone: "amber",
      downloading: true,
    });
  });

  test("names a download that needs a hand", () => {
    const stuck = item({ availability: "partial", download: { state: "blocked" } });
    expect(downloadStatus(stuck)).toEqual({
      label: "Can't import",
      tone: "red",
      downloading: false,
    });
  });
});
