import { describe, expect, test } from "bun:test";
import { extractTable } from "./result-tables.ts";

describe("get_request_states", () => {
  // Chat and the web app answer "where is my X" from the same states.
  test("tables a request by what it is doing and why", () => {
    const table = extractTable("get_request_states", [
      { title: "Anaconda", year: 2024, state: "searching", detail: undefined },
      { title: "Reacher", state: "blocked", detail: "Found archive file" },
    ]);

    expect(table).toMatchObject({
      headers: ["Title", "State", "Detail"],
      rows: [
        ["Anaconda (2024)", "searching", "—"],
        ["Reacher", "blocked", "Found archive file"],
      ],
    });
  });

  test("says nothing at all when nothing was asked for", () => {
    expect(extractTable("get_request_states", [])).toBeUndefined();
  });
});
