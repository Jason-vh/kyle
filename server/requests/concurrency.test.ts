import { afterAll, afterEach, beforeAll, expect, test } from "bun:test";
import { inArray } from "drizzle-orm";
import { db } from "#server/db/index.ts";
import { mediaRequests, movieSubscriptions, seriesSubscriptions } from "#server/db/schema.ts";
import { createTestUser, deleteTestUser } from "#server/db/testing.ts";
import { releaseSeason, requestMovie, requestSeason, requestSeries } from "./service.ts";

process.env.RADARR_HOST = "http://radarr.test";
process.env.RADARR_API_KEY = "k";
process.env.SONARR_HOST = "http://sonarr.test";
process.env.SONARR_API_KEY = "k";
const realFetch = globalThis.fetch;
const users: string[] = [];

beforeAll(async () => {
  users.push(await createTestUser("First requester"), await createTestUser("Second requester"));
});

afterEach(async () => {
  globalThis.fetch = realFetch;
  await db.delete(mediaRequests).where(inArray(mediaRequests.userId, users));
  await db.delete(movieSubscriptions).where(inArray(movieSubscriptions.userId, users));
  await db.delete(seriesSubscriptions).where(inArray(seriesSubscriptions.userId, users));
});

afterAll(async () => {
  for (const userId of users) await deleteTestUser(userId);
});

function stubMovie(externalAdd = false) {
  const movie = { id: 42, tmdbId: 329865, title: "Arrival", year: 2016 };
  const state = { added: false, posts: 0 };
  globalThis.fetch = (async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = String(input);
    if (url.includes("/movie?tmdbId=")) return Response.json(state.added ? [movie] : []);
    if (url.includes("/movie/lookup/tmdb")) return Response.json(movie);
    if (url.endsWith("/qualityprofile")) return Response.json([{ id: 1 }]);
    if (url.endsWith("/rootfolder")) return Response.json([{ path: "/movies" }]);
    if (url.endsWith("/movie") && init.method === "POST") {
      state.posts++;
      const duplicate = state.added || externalAdd;
      state.added = true;
      if (duplicate) return Response.json({ error: "Already added" }, { status: 400 });
      return Response.json(movie);
    }
    return new Response("unexpected", { status: 500 });
  }) as unknown as typeof fetch;
  return state;
}

function stubSeries(held = true, externalAdd = false) {
  const state = {
    held,
    posts: 0,
    series: {
      id: 9,
      tvdbId: 371980,
      tmdbId: 95396,
      title: "Severance",
      year: 2022,
      seasons: [
        { seasonNumber: 1, monitored: false },
        { seasonNumber: 2, monitored: false },
      ],
    },
  };
  globalThis.fetch = (async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = String(input);
    if (url.includes("/series/lookup")) {
      return Response.json([{ ...state.series, id: state.held ? 9 : null }]);
    }
    if (url.endsWith("/series/9")) {
      if (init.method === "PUT") state.series = JSON.parse(String(init.body));
      return Response.json(state.series);
    }
    if (url.endsWith("/qualityprofile")) return Response.json([{ id: 1 }]);
    if (url.endsWith("/rootfolder")) return Response.json([{ path: "/tv" }]);
    if (url.endsWith("/series") && init.method === "POST") {
      state.posts++;
      const duplicate = state.held || externalAdd;
      state.held = true;
      if (duplicate) return Response.json({ error: "Already added" }, { status: 409 });
      return Response.json(state.series);
    }
    if (url.includes("/episode?seriesId=")) return Response.json([]);
    if (url.includes("/queue?")) return Response.json({ records: [] });
    if (url.endsWith("/command")) return Response.json({ id: 1 });
    return new Response("unexpected", { status: 500 });
  }) as unknown as typeof fetch;
  return state;
}

test("concurrent movie requests add once and preserve both requesters", async () => {
  const state = stubMovie();
  const outcomes = await Promise.all(
    users.map((userId) => requestMovie({ tmdbId: 329865, requestedBy: { userId } })),
  );
  expect(outcomes.map((result) => result.status)).toEqual(["added", "existing"]);
  expect(state.posts).toBe(1);
  const requests = await db
    .select()
    .from(mediaRequests)
    .where(inArray(mediaRequests.userId, users));
  const subscriptions = await db
    .select()
    .from(movieSubscriptions)
    .where(inArray(movieSubscriptions.userId, users));
  expect(requests).toHaveLength(2);
  expect(subscriptions).toHaveLength(2);
});

test("an external movie add is recovered without losing attribution", async () => {
  stubMovie(true);
  expect(await requestMovie({ tmdbId: 329865, requestedBy: { userId: users[0]! } })).toMatchObject({
    status: "existing",
    movie: { id: 42 },
  });
  expect(
    await db.select().from(mediaRequests).where(inArray(mediaRequests.userId, users)),
  ).toHaveLength(1);
});

test("TMDB and TVDB requests share the same series creation lock", async () => {
  const state = stubSeries(false);
  const outcomes = await Promise.all([
    requestSeries({ tmdbId: 95396, requestedBy: { userId: users[0]! } }),
    requestSeries({ tvdbId: 371980, requestedBy: { userId: users[1]! } }),
  ]);
  expect(outcomes.map((result) => result.status).sort()).toEqual(["added", "existing"]);
  expect(state.posts).toBe(1);
  expect(
    await db.select().from(mediaRequests).where(inArray(mediaRequests.userId, users)),
  ).toHaveLength(2);
  expect(
    await db.select().from(seriesSubscriptions).where(inArray(seriesSubscriptions.userId, users)),
  ).toHaveLength(2);
});

test("an external series add is recovered without losing attribution", async () => {
  stubSeries(false, true);
  expect(await requestSeries({ tvdbId: 371980, requestedBy: { userId: users[0]! } })).toMatchObject(
    {
      status: "existing",
      series: { id: 9 },
    },
  );
  expect(
    await db.select().from(seriesSubscriptions).where(inArray(seriesSubscriptions.userId, users)),
  ).toHaveLength(1);
});

test("concurrent season requests do not overwrite each other's monitoring", async () => {
  const state = stubSeries();
  await Promise.all([
    requestSeason({ tmdbId: 95396, seasonNumber: 1, requestedBy: { userId: users[0]! } }),
    requestSeason({ tvdbId: 371980, seasonNumber: 2, requestedBy: { userId: users[1]! } }),
  ]);
  expect(state.series.seasons).toEqual([
    { seasonNumber: 1, monitored: true },
    { seasonNumber: 2, monitored: true },
  ]);
  expect(
    await db.select().from(mediaRequests).where(inArray(mediaRequests.userId, users)),
  ).toHaveLength(2);
});

test("releasing one season cannot overwrite a concurrent request for another", async () => {
  const state = stubSeries();
  state.series.seasons[0]!.monitored = true;
  await Promise.all([releaseSeason(9, 1), requestSeason({ tvdbId: 371980, seasonNumber: 2 })]);
  expect(state.series.seasons).toEqual([
    { seasonNumber: 1, monitored: false },
    { seasonNumber: 2, monitored: true },
  ]);
});
