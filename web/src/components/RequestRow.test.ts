import { describe, expect, test } from "vitest";
import { mount } from "@vue/test-utils";
import type { MediaRequest, RequestState } from "@shared/types";
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
    state: "available",
    ...overrides,
  };
}

const render = (overrides: Partial<MediaRequest> = {}) =>
  mount(RequestRow, {
    props: { request: requestWith(overrides) },
    global: { stubs: { RouterLink: true } },
  });

describe("RequestRow", () => {
  // The home screen and the requests page both render this, so the wording
  // for a state is fixed here rather than in either of them.
  const WORDING: Record<RequestState, string> = {
    available: "Ready",
    downloading: "Downloading",
    pending: "Looking",
    unavailable: "Gone",
  };

  test.each(Object.entries(WORDING))("a %s request reads as %s", (state, label) => {
    const row = render({ state: state as RequestState });
    expect(row.text()).toContain(label);
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
    expect(render({ state: "pending" }).find(".bg-accent-amber").exists()).toBe(false);
  });

  test("names the requester only when there is one to name", () => {
    expect(render({ requestedBy: "Jane" }).text()).toContain("Jane");
    expect(render().text()).toContain("Movie");
  });
});
