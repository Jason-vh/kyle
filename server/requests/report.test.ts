import { describe, expect, test } from "bun:test";
import { reportBody } from "./report.ts";

describe("reportBody", () => {
  // An admin reading the bell should not have to open Sonarr to learn why.
  test("carries what the service said about it", () => {
    const body = reportBody("Jane", { state: "blocked", detail: "Found archive file" });

    expect(body).toBe("Jane reported a problem. It is blocked — Found archive file.");
  });

  test("still reads as a sentence when the service said nothing", () => {
    expect(reportBody("Bob", { state: "stalled" })).toBe("Bob reported a problem. It is stalled.");
  });

  // A series can be mostly fine and one season stuck, so say which.
  test("names the season when that is what was asked for", () => {
    expect(reportBody("Bob", { state: "searching" }, 3)).toBe(
      "Bob reported a problem with season 3. It is searching.",
    );
  });
});
