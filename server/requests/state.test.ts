import { describe, expect, test } from "bun:test";
import { placeOf, resolveState, scopeOf } from "./state.ts";
import type { LibraryEntry } from "./library.ts";
import type { QueueStatus } from "./queue.ts";

function entry(overrides: Partial<LibraryEntry> = {}): LibraryEntry {
  return { serviceId: 1, monitored: true, hasFiles: false, complete: false, ...overrides };
}

const downloading: QueueStatus = { state: "downloading", progress: 0.5 };

describe("resolveState", () => {
  test("the queue speaks first, whatever is already on disk", () => {
    expect(resolveState({ entry: entry({ hasFiles: true }), queue: downloading })).toEqual(
      downloading,
    );
    expect(resolveState({ entry: entry({ monitored: false }), queue: downloading })).toEqual(
      downloading,
    );
  });

  // An upgrade for a film already there is nothing the requester is waiting on.
  test("a title complete on disk stays ready while an upgrade downloads", () => {
    expect(
      resolveState({ entry: entry({ hasFiles: true, complete: true }), queue: downloading }),
    ).toEqual({
      state: "ready",
    });
  });

  test("files on disk and nothing in the queue is ready", () => {
    expect(resolveState({ entry: entry({ hasFiles: true }) })).toEqual({
      state: "ready",
      missing: undefined,
    });
  });

  // A series is watchable and short of a season at the same time.
  test("a ready series still says which season it is short of", () => {
    const missing = [{ season: 4, episodes: 2 }];

    expect(resolveState({ entry: entry({ hasFiles: true, missing }) })).toEqual({
      state: "ready",
      missing,
    });
    expect(
      resolveState({ entry: entry({ hasFiles: true, missing }), queue: downloading }),
    ).toMatchObject({
      state: "downloading",
      missing,
    });
  });

  // On disk is not watchable: Plex has to scan it in first.
  test("a file Plex has yet to show is still being imported", () => {
    const onDisk = entry({ hasFiles: true, filesAddedAt: "2026-09-20T09:00:00Z" });

    expect(
      resolveState({
        entry: onDisk,
        plex: { reachable: true },
        now: new Date("2026-09-20T10:00:00Z"),
      }),
    ).toEqual({ state: "importing", since: "2026-09-20T09:00:00Z" });
  });

  test("a file Plex has scanned is ready, and says where to watch it", () => {
    const onDisk = entry({ hasFiles: true, filesAddedAt: "2026-09-20T09:00:00Z" });
    const plex = { reachable: true, url: "https://app.plex.tv/…/details?key=x" };

    expect(
      resolveState({ entry: onDisk, plex, now: new Date("2026-09-20T10:00:00Z") }),
    ).toMatchObject({ state: "ready", plexUrl: plex.url });
  });

  // Plex not knowing a day-old file means it matched it to nothing, not that
  // it is still scanning — and "almost there" forever is worse than "ready".
  test("an old file Plex never showed is ready anyway", () => {
    const onDisk = entry({ hasFiles: true, filesAddedAt: "2026-09-18T09:00:00Z" });

    expect(
      resolveState({
        entry: onDisk,
        plex: { reachable: true },
        now: new Date("2026-09-20T10:00:00Z"),
      }),
    ).toMatchObject({ state: "ready" });
  });

  test("a Plex nobody can reach holds nothing back", () => {
    const onDisk = entry({ hasFiles: true, filesAddedAt: "2026-09-20T09:00:00Z" });

    expect(
      resolveState({
        entry: onDisk,
        plex: { reachable: false },
        now: new Date("2026-09-20T10:00:00Z"),
      }),
    ).toMatchObject({ state: "ready" });
  });

  // The one nobody could see before: nothing will ever happen here.
  test("nothing on disk and nobody monitoring is paused", () => {
    expect(resolveState({ entry: entry({ monitored: false }) })).toEqual({ state: "paused" });
  });

  test("a title that is not out yet says when it is expected", () => {
    const awaiting = { reason: "unreleased" as const, expectedAt: "2026-03-06" };

    expect(resolveState({ entry: entry({ awaiting }) })).toEqual({
      state: "unreleased",
      expectedAt: "2026-03-06",
    });
  });

  test("a film out only in cinemas waits for its digital release", () => {
    const awaiting = { reason: "waiting" as const, expectedAt: "2025-12-01" };

    expect(resolveState({ entry: entry({ awaiting }) })).toEqual({
      state: "waiting",
      expectedAt: "2025-12-01",
    });
  });

  test("obtainable, monitored, and nothing to show for it is searching", () => {
    expect(resolveState({ entry: entry() })).toEqual({ state: "searching", since: undefined });
  });

  // Months since anything was tried is the difference between looking and giving up.
  test("a search says when it was last run", () => {
    const lastSearchedAt = "2026-06-18T13:41:26Z";

    expect(resolveState({ entry: entry({ lastSearchedAt }) })).toEqual({
      state: "searching",
      since: lastSearchedAt,
    });
  });

  // The request outlives the title, so a removal has to read as something.
  test("a title no longer in the library is removed", () => {
    expect(resolveState({})).toEqual({ state: "removed" });
  });

  // Absence cannot say who took it out; what we wrote down when it left can.
  test("a removal we recorded says who did it and when", () => {
    const at = new Date("2026-09-01T10:00:00Z");

    expect(resolveState({ removal: { removedBy: "Jason", deletedFiles: true, at } })).toEqual({
      state: "removed",
      detail: "Removed by Jason",
      since: at.toISOString(),
    });
  });

  test("a removal nobody was named for still says when it happened", () => {
    const at = new Date("2026-09-01T10:00:00Z");

    expect(resolveState({ removal: { removedBy: null, deletedFiles: false, at } })).toEqual({
      state: "removed",
      detail: undefined,
      since: at.toISOString(),
    });
  });
});

describe("placeOf", () => {
  const places = new Map([["movie:27205", "https://app.plex.tv/…/details?key=x"]]);

  test("finds a title by media type and TMDB id", () => {
    expect(placeOf(places, { mediaType: "movie", tmdbId: 27205 })).toEqual({
      reachable: true,
      url: "https://app.plex.tv/…/details?key=x",
    });
  });

  test("a title Plex does not list is reachable but unplaced", () => {
    expect(placeOf(places, { mediaType: "series", tmdbId: 27205 })).toEqual({
      reachable: true,
      url: undefined,
    });
  });

  // An empty map and no map at all mean opposite things.
  test("no catalog at all says nothing about anything", () => {
    expect(placeOf(undefined, { mediaType: "movie", tmdbId: 27205 })).toEqual({
      reachable: false,
    });
  });
});

describe("scopeOf", () => {
  const season = entry({ hasFiles: true, complete: true });
  const series = entry({ seasons: new Map([[3, season]]) });

  test("a request for the whole series is answered by the series", () => {
    expect(scopeOf(series, null)).toBe(series);
  });

  test("a request for one season is answered by that season", () => {
    expect(scopeOf(series, 3)).toBe(season);
  });

  // Releasing a season leaves the request behind it pointing at nothing, which
  // is the same position as a title removed from the library.
  test("a season the series no longer has is nothing at all", () => {
    expect(scopeOf(series, 4)).toBeUndefined();
    expect(resolveState({ entry: scopeOf(series, 4) })).toEqual({ state: "removed" });
  });
});
