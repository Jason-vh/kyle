import { describe, expect, test } from "vitest";
import type { SeasonOption } from "#shared/types";
import {
  choiceLabel,
  isEmptyChoice,
  latestSeason,
  regularSeasons,
  seasonDetail,
} from "./season-choice";

const OPTIONS: SeasonOption[] = [
  { seasonNumber: 1 },
  { seasonNumber: 2 },
  { seasonNumber: 3 },
  { seasonNumber: 0 },
];

describe("regularSeasons", () => {
  test("leaves the specials out", () => {
    expect(regularSeasons(OPTIONS)).toEqual([1, 2, 3]);
  });
});

describe("latestSeason", () => {
  test("is the newest regular season, never the specials", () => {
    expect(latestSeason(OPTIONS)).toEqual([3]);
  });

  test("is nothing for a series with only specials", () => {
    expect(latestSeason([{ seasonNumber: 0 }])).toEqual([]);
  });
});

describe("seasonDetail", () => {
  test("says how long and when", () => {
    expect(seasonDetail({ seasonNumber: 1, episodeCount: 9, year: 2022 })).toBe(
      "9 episodes · 2022",
    );
  });

  test("says nothing it does not know", () => {
    expect(seasonDetail({ seasonNumber: 4 })).toBe("");
  });
});

describe("choiceLabel", () => {
  test("names a single season", () => {
    expect(choiceLabel([2], false)).toBe("Request Season 2");
    expect(choiceLabel([0], false)).toBe("Request Specials");
  });

  test("counts several", () => {
    expect(choiceLabel([1, 2, 3], true)).toBe("Request 3 seasons");
  });

  test("following alone says so", () => {
    expect(choiceLabel([], true)).toBe("Follow only");
  });

  test("asks for a choice when there is none", () => {
    expect(choiceLabel([], false)).toBe("Choose a season");
    expect(isEmptyChoice([], false)).toBe(true);
    expect(isEmptyChoice([], true)).toBe(false);
  });
});
