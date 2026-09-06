import { describe, expect, test } from "bun:test";
import { extractMediaEvent } from "#server/db/media-events.ts";

/** A tool result as the agent hands it over. */
function result(payload: unknown) {
  return { content: [{ type: "text", text: JSON.stringify(payload) }] };
}

describe("extractMediaEvent", () => {
  // These payloads are the tools' own output. When a tool changes what it
  // returns, the assertion here is what notices — otherwise media events stop
  // being recorded and nothing fails.
  test("add_movie carries the ids a subscription needs", () => {
    const event = extractMediaEvent(
      "add_movie",
      { tmdbId: 27205 },
      result({ title: "Inception", year: 2010, id: 42, titleSlug: "inception-2010" }),
    );

    expect(event).toEqual({
      action: "add",
      mediaType: "movie",
      title: "Inception",
      ids: { tmdb: 27205, radarr: 42, titleSlug: "inception-2010" },
    });
  });

  test("remove_movie takes its ids from the result, which is where they are", () => {
    const event = extractMediaEvent(
      "remove_movie",
      { movieId: 42 },
      result({
        title: "Inception",
        radarrId: 42,
        tmdbId: 27205,
        imdbId: "tt1375666",
        titleSlug: "inception-2010",
      }),
    );

    expect(event).toMatchObject({
      action: "remove",
      mediaType: "movie",
      title: "Inception",
      ids: { radarr: 42, tmdb: 27205, imdb: "tt1375666" },
    });
  });

  test("add_series reads the series the tool nests in its result", () => {
    const event = extractMediaEvent(
      "add_series",
      { tvdbId: 371980, monitorOption: "all" },
      result({ series: { title: "Severance", id: 9, titleSlug: "severance" }, message: "Added" }),
    );

    expect(event).toEqual({
      action: "add",
      mediaType: "series",
      title: "Severance",
      ids: { tvdb: 371980, sonarr: 9, titleSlug: "severance" },
    });
  });

  test("remove_season records which season went", () => {
    const event = extractMediaEvent(
      "remove_season",
      { seriesId: 9, seasonNumber: 2 },
      result({ title: "Severance", sonarrId: 9, tvdbId: 371980 }),
    );

    expect(event).toMatchObject({ action: "remove", mediaType: "series", seasonNumber: 2 });
  });

  test("remove_series has no season, so it means the whole thing", () => {
    const event = extractMediaEvent(
      "remove_series",
      { seriesId: 9 },
      result({ title: "Severance", sonarrId: 9, tvdbId: 371980 }),
    );

    expect(event?.seasonNumber).toBeUndefined();
  });

  test("a download subscribes to the season it was asked for", () => {
    const event = extractMediaEvent(
      "download_episodes",
      { seriesId: 9, seasonNumber: 2 },
      result({ seriesTitle: "Severance", seriesId: 9, tvdbId: 371980 }),
    );

    expect(event).toEqual({
      action: "download",
      mediaType: "series",
      title: "Severance",
      ids: { sonarr: 9, tvdb: 371980 },
      seasonNumber: 2,
    });
  });

  // Threads recorded before the tool was renamed still have to replay.
  test("the old name for download_episodes still resolves", () => {
    const event = extractMediaEvent(
      "search_episodes",
      { seriesId: 9 },
      result({ seriesTitle: "Severance", seriesId: 9 }),
    );

    expect(event?.action).toBe("download");
  });

  test("a download whose result names no series is not an event", () => {
    expect(
      extractMediaEvent("download_episodes", { seriesId: 9 }, result({ ok: true })),
    ).toBeNull();
  });

  test("a tool that changes nothing produces no event", () => {
    expect(extractMediaEvent("get_all_movies", {}, result([{ title: "Inception" }]))).toBeNull();
    expect(extractMediaEvent("web_search", { q: "x" }, result({ results: [] }))).toBeNull();
  });

  test("a result that is not JSON is not an event", () => {
    expect(
      extractMediaEvent("add_movie", { tmdbId: 1 }, { content: [{ type: "text", text: "oops" }] }),
    ).toBeNull();
  });

  test("a result with no text at all is not an event", () => {
    expect(extractMediaEvent("add_movie", { tmdbId: 1 }, {})).toBeNull();
    expect(extractMediaEvent("add_movie", { tmdbId: 1 }, { content: [] })).toBeNull();
  });
});
