import { describe, expect, test } from "bun:test";
import type { LibraryItem } from "#shared/types.ts";
import type { TitlePlay } from "#server/plex/history.ts";
import { watchedTitles } from "./profile.ts";

const person = { accountId: "1", name: "Jordan" };

function play(key: string, at: string, episode?: [number, number]): TitlePlay {
  return {
    key,
    title: "From Plex",
    person,
    at,
    episode: episode && { seasonNumber: episode[0], episodeNumber: episode[1], title: "Half Loop" },
  };
}

describe("watchedTitles", () => {
  test("lists each title once, most recently watched first", () => {
    const titles = watchedTitles(
      [
        play("series:95396", "2026-03-03T00:00:00Z", [1, 2]),
        play("movie:9880", "2026-03-02T00:00:00Z"),
        play("series:95396", "2026-03-01T00:00:00Z", [1, 1]),
        play("movie:9880", "2026-02-01T00:00:00Z"),
      ],
      new Map(),
    );

    expect(titles.map((title) => [title.mediaType, title.tmdbId, title.detail])).toEqual([
      ["series", 95396, "S01E02 Half Loop · 2 episodes"],
      ["movie", 9880, "Watched 2 times"],
    ]);
  });

  test("names a title as the library does, falling back to Plex", () => {
    const item = { title: "Severance", year: 2022, posterUrl: "/p.jpg" } as LibraryItem;
    const [held] = watchedTitles(
      [play("series:95396", "2026-03-03T00:00:00Z", [1, 1])],
      new Map([["series:95396", item]]),
    );
    const [gone] = watchedTitles([play("movie:1", "2026-03-03T00:00:00Z")], new Map());

    expect(held).toMatchObject({ title: "Severance", year: 2022, posterUrl: "/p.jpg" });
    expect(gone?.title).toBe("From Plex");
  });
});
