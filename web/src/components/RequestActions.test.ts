import { afterEach, describe, expect, test, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { createPinia } from "pinia";
import { PiniaColada } from "@pinia/colada";
import type { MediaRequest, RequestState } from "#shared/types";
import RequestActions from "./RequestActions.vue";

const realFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = realFetch;
});

function request(state: RequestState): MediaRequest {
  return {
    id: "r1",
    mediaType: "movie",
    tmdbId: 27205,
    title: "Inception",
    year: 2010,
    posterPath: "/poster.jpg",
    createdAt: new Date().toISOString(),
    state,
  };
}

function render(state: RequestState) {
  return mount(RequestActions, {
    props: { request: request(state) },
    global: { plugins: [createPinia(), [PiniaColada, {}]] },
  });
}

describe("RequestActions", () => {
  // An action per state is the point: what to press follows from what is wrong.
  const OFFERED: Partial<Record<RequestState, string>> = {
    searching: "Search again",
    stalled: "Try another",
    blocked: "Tell an admin",
    removed: "Request again",
  };

  test.each(Object.entries(OFFERED))("a %s request offers %s", (state, label) => {
    expect(render(state as RequestState).text()).toContain(label);
  });

  test.each(["ready", "downloading", "importing", "unreleased", "waiting", "paused", "found"])(
    "a %s request offers nothing to press",
    (state) => {
      expect(
        render(state as RequestState)
          .find("button")
          .exists(),
      ).toBe(false);
    },
  );

  test("a stalled request asks the server for another release", async () => {
    const fetched = vi.fn((_url: string, _init?: RequestInit) =>
      Promise.resolve(Response.json({ discarded: 1 })),
    );
    globalThis.fetch = fetched as unknown as typeof fetch;

    const actions = render("stalled");
    await actions.find("button").trigger("click");
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(fetched.mock.calls[0]?.[0]).toContain("/api/requests/movie/27205/retry");
    expect(fetched.mock.calls[0]?.[1]?.method).toBe("POST");
    expect(actions.text()).toContain("Looking…");
  });

  test("a blocked request goes to an admin, and says so", async () => {
    globalThis.fetch = (() =>
      Promise.resolve(Response.json({ notified: 2 }))) as unknown as typeof fetch;

    const actions = render("blocked");
    await actions.find("button").trigger("click");
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(actions.text()).toContain("Reported");
  });

  test("a failure is said out loud rather than swallowed", async () => {
    globalThis.fetch = (() =>
      Promise.resolve(
        Response.json({ error: "Sonarr is down" }, { status: 502 }),
      )) as unknown as typeof fetch;

    const actions = render("searching");
    await actions.find("button").trigger("click");
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(actions.text()).toContain("Sonarr is down");
  });
});
