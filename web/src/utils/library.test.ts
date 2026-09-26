import { describe, expect, test } from "vitest";
import type { LibraryItem } from "#web/api/library";
import {
  applyLibraryView,
  changedFilters,
  DEFAULT_LIBRARY_VIEW,
  filterLabel,
  groupByLetter,
  libraryDetails,
  libraryStatuses,
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
  test("sorts by title, ignoring a leading article", () => {
    expect(titles(applyLibraryView(library, DEFAULT_LIBRARY_VIEW))).toEqual([
      "Arrival",
      "The Boys",
      "Dune",
      "Inception",
    ]);
  });

  test("sorts numbers by value", () => {
    const numbered = [
      item({ title: "1883" }),
      item({ title: "28 Days Later" }),
      item({ title: "9-1-1" }),
    ];
    expect(titles(applyLibraryView(numbered, DEFAULT_LIBRARY_VIEW))).toEqual([
      "9-1-1",
      "28 Days Later",
      "1883",
    ]);
  });

  test("puts the largest first when sorting by size", () => {
    const shown = applyLibraryView(library, { ...DEFAULT_LIBRARY_VIEW, sort: "size" });
    expect(titles(shown)).toEqual(["The Boys", "Dune", "Arrival", "Inception"]);
  });

  test("matches the search anywhere in the title, ignoring case", () => {
    const shown = applyLibraryView(library, { ...DEFAULT_LIBRARY_VIEW, search: " BOY " });
    expect(titles(shown)).toEqual(["The Boys"]);
  });

  test("ignores punctuation and accents in the search", () => {
    const titled = [
      item({ title: "9-1-1" }),
      item({ title: "Dash & Lily" }),
      item({ title: "Shōgun" }),
    ];
    const search = (term: string) =>
      titles(applyLibraryView(titled, { ...DEFAULT_LIBRARY_VIEW, search: term }));

    expect(search("911")).toEqual(["9-1-1"]);
    expect(search("dash lily")).toEqual(["Dash & Lily"]);
    expect(search("shogun")).toEqual(["Shōgun"]);
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

describe("groupByLetter", () => {
  test("groups by the first letter after a leading article", () => {
    const groups = groupByLetter([arrival, boys, dune, item({ title: "Die Hard" })]);
    expect(groups.map((group) => [group.letter, titles(group.items)])).toEqual([
      ["A", ["Arrival"]],
      ["B", ["The Boys"]],
      ["D", ["Dune", "Die Hard"]],
    ]);
  });

  test("puts titles that start with a number or symbol under #", () => {
    const groups = groupByLetter([item({ title: "1883" }), item({ title: "Ōzark" })]);
    expect(groups.map((group) => group.letter)).toEqual(["#", "O"]);
  });
});

describe("libraryDetails", () => {
  const GB = 1000 ** 3;

  test("gives the year, type and size on disk", () => {
    expect(libraryDetails(item({ year: 2016, sizeOnDisk: 19 * GB }))).toEqual([
      "2016",
      "Movie",
      "19 GB",
    ]);
  });

  test("counts the episodes of a complete series", () => {
    const series = item({
      mediaType: "series",
      sizeOnDisk: 321 * GB,
      episodes: { present: 103, total: 103 },
    });
    expect(libraryDetails(series)).toEqual(["Series", "103 ep", "321 GB"]);
  });

  test("leaves the count of an incomplete series to its status", () => {
    const series = item({
      mediaType: "series",
      availability: "partial",
      episodes: { present: 34, total: 93 },
    });
    expect(libraryDetails(series)).toEqual(["Series"]);
  });

  test("leads with the size when asked", () => {
    expect(libraryDetails(item({ year: 2016, sizeOnDisk: 19 * GB }), true)).toEqual([
      "19 GB",
      "2016",
      "Movie",
    ]);
  });
});

describe("watchedLabel", () => {
  test("counts people rather than naming them", () => {
    expect(watchedLabel(1)).toBe("Watched by 1 person");
    expect(watchedLabel(5)).toBe("Watched by 5 people");
  });
});

describe("libraryStatuses", () => {
  const labels = (shown: LibraryItem) => libraryStatuses(shown).map((status) => status.label);

  test("says nothing about a title that is all there", () => {
    expect(libraryStatuses(item({}))).toEqual([]);
  });

  test("says a title with nothing on disk and nothing queued is not on disk", () => {
    expect(libraryStatuses(item({ availability: "missing" }))).toEqual([
      { label: "Not on disk", tone: "neutral", downloading: false },
    ]);
  });

  test("gives how far along a download is", () => {
    const downloading = item({
      availability: "missing",
      download: { state: "downloading", progress: 0.424 },
    });
    expect(libraryStatuses(downloading)).toEqual([
      { label: "42%", tone: "amber", downloading: true },
    ]);
  });

  test("names a download that needs a hand", () => {
    const stuck = item({ availability: "partial", download: { state: "blocked" } });
    expect(libraryStatuses(stuck)).toContainEqual({
      label: "Can't import",
      tone: "red",
      downloading: false,
    });
  });

  test("lists episodes before the download, and says nothing of monitoring", () => {
    const series = item({
      mediaType: "series",
      availability: "partial",
      monitored: false,
      episodes: { present: 34, total: 93 },
      download: { state: "downloading", progress: 0.5 },
    });
    expect(labels(series)).toEqual(["34 of 93 episodes", "50%"]);
  });
});
