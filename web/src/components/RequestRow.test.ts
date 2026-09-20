import { describe, expect, test } from "vitest";
import { mount } from "@vue/test-utils";
import type { MediaRequest, RequestState } from "#shared/types";
import RequestRow from "./RequestRow.vue";

function requestWith(overrides: Partial<MediaRequest> = {}): MediaRequest {
  return {
    id: "r1",
    mediaType: "movie",
    tmdbId: 27205,
    title: "Inception",
    year: 2010,
    posterPath: "/poster.jpg",
    createdAt: new Date().toISOString(),
    state: "ready",
    ...overrides,
  };
}

const render = (overrides: Partial<MediaRequest> = {}) =>
  mount(RequestRow, {
    props: { request: requestWith(overrides) },
    global: { stubs: { RouterLink: true, RequestActions: true } },
  });

describe("RequestRow", () => {
  // The home screen and the requests page both render this, so the wording
  // for a state is fixed here rather than in either of them.
  const WORDING: Record<RequestState, string> = {
    unreleased: "Not out yet",
    waiting: "In cinemas",
    searching: "Looking",
    found: "Found one",
    downloading: "Downloading",
    stalled: "Stalled",
    blocked: "Can't import",
    importing: "Almost there",
    ready: "Ready",
    paused: "Paused",
    removed: "Gone",
  };

  test.each(Object.entries(WORDING))("a %s request reads as %s", (state, label) => {
    const row = render({ state: state as RequestState });
    expect(row.text()).toContain(label);
  });

  test("says when an unreleased title is expected", () => {
    const row = render({ state: "unreleased", expectedAt: "2026-03-06" });
    expect(row.text()).toContain("Not out until 6 Mar");
  });

  test("says when a film in cinemas can be fetched", () => {
    const row = render({ state: "waiting", expectedAt: "2026-12-01" });
    expect(row.text()).toContain("Digital release 1 Dec");
  });

  // Why it is stuck is the whole point of the state.
  test("passes on the reason a service gives", () => {
    const row = render({ state: "blocked", detail: "Found archive file, might need extraction" });
    expect(row.text()).toContain("Found archive file, might need extraction");
  });

  test("a ready series says which season it is short of", () => {
    const row = render({ state: "ready", missing: [{ season: 4, episodes: 2 }] });
    expect(row.text()).toContain("Season 4 · 2 episodes missing");
  });

  test("adds several incomplete seasons up rather than listing them", () => {
    const row = render({
      state: "ready",
      missing: [
        { season: 2, episodes: 1 },
        { season: 7, episodes: 5 },
      ],
    });

    expect(row.text()).toContain("2 seasons · 6 episodes missing");
  });

  test("explains a state the service says nothing about", () => {
    expect(render({ state: "stalled" }).text()).toContain("No seeders");
    expect(render({ state: "paused" }).text()).toContain("Nobody is looking for this");
  });

  test("says how long it has been that way", () => {
    const since = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
    expect(render({ state: "stalled", since }).text()).toContain("3h ago");
  });

  // A search from months ago is the reason to press retry.
  test("says when a search was last tried", () => {
    const since = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    const row = render({ state: "searching", since });

    expect(row.text()).toContain("Nothing found — last tried 2h ago");
  });

  test("a search nobody has run yet says only that it is looking", () => {
    expect(render({ state: "searching" }).text()).toContain("Searching for a release");
  });

  test("shows how far along a download is", () => {
    const row = render({ state: "downloading", progress: 0.42, eta: "00:12:31" });

    expect(row.text()).toContain("42%");
    expect(row.text()).toContain("00:12:31");
    expect(row.find(".bg-accent-amber").attributes("style")).toContain("width: 42%");
  });

  // Zero progress would otherwise be an invisible bar that looks broken.
  test("a download that has just started still shows a bar", () => {
    const row = render({ state: "downloading", progress: 0 });
    expect(row.find(".bg-accent-amber").attributes("style")).toContain("width: 2%");
  });

  test("shows no bar for anything that is not downloading", () => {
    expect(render({ state: "searching" }).find(".bg-accent-amber").exists()).toBe(false);
  });

  // Which action each state deserves is pinned in RequestActions.test.ts.
  test("hands every request its actions", () => {
    expect(render().findComponent({ name: "RequestActions" }).exists()).toBe(true);
  });

  test("names the requester only when there is one to name", () => {
    expect(render({ requestedBy: "Jane" }).text()).toContain("Jane");
    expect(render().text()).toContain("Movie");
  });
});
