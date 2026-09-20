import { expect, test } from "bun:test";
import { readAllPages } from "./pagination.ts";

test("reads every page, including a shorter server-side page size", async () => {
  const pages: number[] = [];
  const result = await readAllPages(async (page) => {
    pages.push(page);
    return { records: [{ id: page }], totalRecords: 3 };
  });
  expect(pages).toEqual([1, 2, 3]);
  expect(result.records).toEqual([{ id: 1 }, { id: 2 }, { id: 3 }]);
});

test("accepts an empty complete result", async () => {
  expect(await readAllPages(async () => ({ records: [], totalRecords: 0 }))).toEqual({
    records: [],
    totalRecords: 0,
  });
});

test("rejects a missing remainder rather than returning a partial result", async () => {
  await expect(
    readAllPages(async (page) => ({ records: page === 1 ? [{ id: 1 }] : [], totalRecords: 2 })),
  ).rejects.toThrow("Incomplete");
});

test("rejects results that change between pages", async () => {
  await expect(
    readAllPages(async (page) => ({ records: [{ id: page }], totalRecords: page + 1 })),
  ).rejects.toThrow("changed");
});

test("rejects repeated pages even when their counts add up", async () => {
  await expect(
    readAllPages(async () => ({ records: [{ id: 1 }], totalRecords: 2 })),
  ).rejects.toThrow("repeated");
});

test("rejects invalid totals", async () => {
  await expect(readAllPages(async () => ({ records: [], totalRecords: NaN }))).rejects.toThrow(
    "Invalid",
  );
});

test("limits pagination without returning partial data", async () => {
  await expect(
    readAllPages(async (page) => ({ records: [{ id: page }], totalRecords: 101 })),
  ).rejects.toThrow("page limit");
});
