import { expect, test } from "bun:test";
import { extractTable } from "./result-tables.ts";

const asResult = (value: unknown) => ({
  content: [{ type: "text", text: JSON.stringify(value) }],
});

test("movie queue becomes a table", () => {
  const table = extractTable(
    "get_movie_queue",
    asResult({
      totalRecords: 1,
      downloads: [
        {
          movie: { title: "Inception", year: 2010 },
          trackedDownloadState: "downloading",
          timeLeft: "00:12:30",
          quality: "Bluray-1080p",
        },
      ],
    }),
  );

  expect(table?.caption).toBe("Download queue");
  expect(table?.headers).toEqual(["Movie", "Status", "Time left", "Quality"]);
  expect(table?.rows[0]).toEqual(["Inception (2010)", "downloading", "00:12:30", "Bluray-1080p"]);
});

test("calendar rows show episode codes", () => {
  const table = extractTable(
    "get_calendar",
    asResult([
      {
        series: { title: "Ted Lasso" },
        seasonNumber: 4,
        episodeNumber: 2,
        title: "Curiouser",
        airDate: "2026-08-12",
        hasFile: false,
      },
    ]),
  );

  expect(table?.rows[0]).toEqual(["Ted Lasso", "S04E02 Curiouser", "2026-08-12", "No"]);
});

test("long queues are capped and the caption says so", () => {
  const downloads = Array.from({ length: 23 }, (_, i) => ({
    movie: { title: `Movie ${i}` },
    status: "queued",
  }));
  const table = extractTable("get_movie_queue", asResult({ totalRecords: 23, downloads }));

  expect(table?.rows).toHaveLength(10);
  expect(table?.caption).toBe("Download queue (10 of 23)");
});

test("empty and non-tabular results produce nothing", () => {
  expect(
    extractTable("get_series_queue", asResult({ message: "No downloads in progress" })),
  ).toBeUndefined();
  expect(extractTable("get_calendar", asResult([]))).toBeUndefined();
  expect(extractTable("get_all_movies", asResult([{ title: "x" }]))).toBeUndefined();
  expect(
    extractTable("get_movie_queue", { content: [{ type: "text", text: "not json" }] }),
  ).toBeUndefined();
});
