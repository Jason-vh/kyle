import { describe, expect, test } from "vitest";
import { titleAndYear } from "./media-title";

describe("titleAndYear", () => {
  test("leaves a plain title alone", () => {
    expect(titleAndYear("Severance", 2022)).toEqual({ title: "Severance", year: 2022 });
  });

  test("takes the year out of the title", () => {
    expect(titleAndYear("Doctor Who (2005)", 2005)).toEqual({ title: "Doctor Who", year: 2005 });
  });

  test("keeps the known year over the one in the title", () => {
    expect(titleAndYear("The Flash (2014)", 2015)).toEqual({ title: "The Flash", year: 2015 });
  });

  test("falls back on the year in the title", () => {
    expect(titleAndYear("Doctor Who (2005)")).toEqual({ title: "Doctor Who", year: 2005 });
  });

  test("leaves years that are part of the name", () => {
    expect(titleAndYear("Blade Runner 2049", 2017)).toEqual({
      title: "Blade Runner 2049",
      year: 2017,
    });
    expect(titleAndYear("(500) Days of Summer", 2009)).toEqual({
      title: "(500) Days of Summer",
      year: 2009,
    });
  });
});
