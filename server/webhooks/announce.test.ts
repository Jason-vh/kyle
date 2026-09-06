import { describe, expect, test } from "bun:test";
import { notificationFor } from "./announce.ts";
import type { MediaNotificationInfo } from "./types.ts";

// No mocks: the wiring around this is covered against a real database in
// announce.integration.test.ts, because `mock.module` replaces a module for the
// whole run and would follow it there.
describe("notificationFor", () => {
  test("names a film the way a person would", () => {
    const media: MediaNotificationInfo = { mediaType: "movie", title: "Inception", year: 2010 };

    expect(notificationFor(media, { radarr: 42, tmdb: 27205 })).toEqual({
      mediaType: "movie",
      title: "Inception (2010)",
      body: "It is ready to watch.",
      tmdbId: 27205,
      serviceId: 42,
    });
  });

  test("names the episodes that landed", () => {
    const media: MediaNotificationInfo = {
      mediaType: "series",
      title: "Severance",
      year: 2022,
      episodes: [
        { seasonNumber: 1, episodeNumber: 4, title: "The You You Are" },
        { seasonNumber: 1, episodeNumber: 5, title: "The Grim Barbarity of Optics" },
      ],
    };

    expect(notificationFor(media, { sonarr: 9 })).toMatchObject({
      title: "Severance (2022)",
      body: 'S01E04 "The You You Are", S01E05 "The Grim Barbarity of Optics" is ready to watch.',
      serviceId: 9,
    });
  });

  test("a series with no episodes named still reads sensibly", () => {
    const media: MediaNotificationInfo = { mediaType: "series", title: "Severance", year: 2022 };

    expect(notificationFor(media, { sonarr: 9 }).body).toBe("It is ready to watch.");
  });

  // The two services number independently, so only one id is ever the right one.
  test("takes the service id from whichever service reported it", () => {
    const movie: MediaNotificationInfo = { mediaType: "movie", title: "Arrival", year: 2016 };
    expect(notificationFor(movie, { radarr: 7 }).serviceId).toBe(7);
    expect(notificationFor({ ...movie, mediaType: "series" }, { sonarr: 8 }).serviceId).toBe(8);
  });
});
