import { describe, expect, test } from "bun:test";
import { requestersQuery } from "./requests.ts";

// Drizzle builds SQL without touching the database, so this needs no connection.
describe("requestersQuery", () => {
  test("binds each id separately rather than passing an array to one parameter", () => {
    const { sql, params } = requestersQuery("movie", [11, 22, 33]).toSQL();

    expect(sql).toContain("in ($2, $3, $4)");
    expect(params).toEqual(["movie", 11, 22, 33]);
  });

  test("filters to the requested media type", () => {
    const { params } = requestersQuery("series", [7]).toSQL();

    expect(params).toEqual(["series", 7]);
  });
});
