import { describe, expect, test } from "bun:test";
import { episodesLabel, seasonName } from "./media.ts";

describe("seasonName", () => {
  test("calls season 0 what Sonarr means by it", () => {
    expect(seasonName(0)).toBe("Specials");
    expect(seasonName(3)).toBe("Season 3");
  });
});

describe("episodesLabel", () => {
  test("names a single episode", () => {
    expect(episodesLabel([{ seasonNumber: 1, episodeNumber: 3, title: "Pilot" }])).toBe(
      "S01E03 Pilot",
    );
  });

  test("counts several episodes of one season under it", () => {
    const episodes = [1, 2, 3].map((episodeNumber) => ({ seasonNumber: 2, episodeNumber }));
    expect(episodesLabel(episodes)).toBe("Season 2 · 3 episodes");
  });

  test("counts episodes across seasons without naming one", () => {
    const episodes = [
      { seasonNumber: 1, episodeNumber: 10 },
      { seasonNumber: 2, episodeNumber: 1 },
    ];
    expect(episodesLabel(episodes)).toBe("2 episodes");
  });
});
