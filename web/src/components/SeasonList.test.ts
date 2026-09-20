import { afterEach, describe, expect, test, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { createPinia } from "pinia";
import { PiniaColada } from "@pinia/colada";
import type { EpisodeSummary, SeasonSummary } from "#shared/types";
import SeasonList from "./SeasonList.vue";

const realFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = realFetch;
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

/** Signs the viewer in as an admin and answers every write with success. */
function stubApi(admin = false) {
  const posted: { url: string; method: string; body?: string }[] = [];
  globalThis.fetch = vi.fn((url: string, init?: RequestInit) => {
    if (init?.method) {
      posted.push({ url, method: init.method, body: init.body as string | undefined });
      return Promise.resolve(new Response(JSON.stringify({ success: true })));
    }
    return Promise.resolve(
      new Response(JSON.stringify({ user: { id: "u1", displayName: "Jason", admin } })),
    );
  }) as unknown as typeof fetch;
  return posted;
}

function episode(overrides: Partial<EpisodeSummary> = {}): EpisodeSummary {
  return {
    episodeNumber: 1,
    title: "Good News",
    hasFile: true,
    monitored: true,
    watchedBy: [],
    ...overrides,
  };
}

function season(overrides: Partial<SeasonSummary> = {}): SeasonSummary {
  return {
    seasonNumber: 1,
    monitored: true,
    episodeCount: 2,
    episodeFileCount: 2,
    sizeOnDisk: 0,
    episodes: [episode()],
    state: "ready",
    requestedBy: [],
    ...overrides,
  };
}

/** The accordion hides its content until opened, so the test opens it. */
async function render(seasons: SeasonSummary[], serviceId?: number) {
  const list = mount(SeasonList, {
    props: { seasons, tmdbId: 95396, posterPath: "/p.jpg", serviceId },
    global: { plugins: [createPinia(), [PiniaColada, {}]] },
    attachTo: document.body,
  });
  for (const trigger of list.findAll("[data-reka-collection-item]")) {
    await trigger.trigger("click");
  }
  await flush();
  return list;
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

/** The confirmation dialog renders in a portal, so the whole document is fair game. */
const clickText = async (label: string, within = "body") => {
  const button = [...document.querySelectorAll(`${within} button`)].find(
    (candidate) => candidate.textContent?.trim() === label,
  );
  (button as HTMLButtonElement).click();
  await flush();
};

const DAY = 24 * 60 * 60 * 1000;
const iso = (offsetDays: number) => new Date(Date.now() + offsetDays * DAY).toISOString();

describe("SeasonList", () => {
  test("names season 0 as the specials it is", async () => {
    const list = await render([season({ seasonNumber: 0 })]);
    expect(list.text()).toContain("Specials");
    expect(list.text()).not.toContain("Season 0");
  });

  test("counts what is on disk against what the season holds", async () => {
    const list = await render([season({ episodeFileCount: 1, episodeCount: 10, state: "airing" })]);
    expect(list.text()).toContain("1/10 episodes");
  });

  test.each([
    ["ready", "Ready"],
    ["searching", "Looking"],
    ["stalled", "Stalled"],
    ["unrequested", "Not requested"],
    ["unreleased", "Not aired yet"],
    ["airing", "Airing"],
  ] as const)("%s reads as %s", async (state, label) => {
    expect((await render([season({ state })])).text()).toContain(label);
  });

  test("says when the next episode of a season still airing arrives", async () => {
    const list = await render([season({ state: "airing", expectedAt: iso(7) })]);

    expect(list.text()).toContain("next");
  });

  test("passes on what the service says about a stall", async () => {
    const list = await render([season({ state: "stalled", detail: "No seeders" })]);

    expect(list.text()).toContain("No seeders");
  });

  test("names whoever asked for this season in particular", async () => {
    const list = await render([season({ requestedBy: ["Jason", "Kate"] })]);

    expect(list.text()).toContain("Jason and Kate");
  });

  // The distinction the page exists to make: nothing is wrong with an episode
  // that has not aired, and everything is wrong with one that has.
  test("an episode still to air says when, not that it is missing", async () => {
    const list = await render([
      season({ episodes: [episode({ hasFile: false, airDate: iso(30) })] }),
    ]);

    expect(list.text()).not.toContain("Missing");
    expect(list.find(".text-accent-red").exists()).toBe(false);
  });

  test("an episode that aired and never arrived is missing", async () => {
    const list = await render([
      season({ episodes: [episode({ hasFile: false, airDate: iso(-30) })] }),
    ]);

    expect(list.find(".text-accent-red").text()).toBe("Missing");
  });

  test("an episode with no date at all is missing rather than unaired", async () => {
    const list = await render([season({ episodes: [episode({ hasFile: false })] })]);

    expect(list.find(".text-accent-red").text()).toBe("Missing");
  });

  test("numbers each episode within its season", async () => {
    const list = await render([
      season({ seasonNumber: 2, episodes: [episode({ episodeNumber: 3 })] }),
    ]);

    expect(list.text()).toContain("S02E03");
  });

  test("says so when Sonarr knows the season but not its episodes", async () => {
    const list = await render([season({ episodes: [] })]);
    expect(list.text()).toContain("no episodes");
  });

  test("shows who has watched an episode", async () => {
    const list = await render([
      season({ episodes: [episode({ watchedBy: [{ name: "Jason" }, { name: "Kate" }] })] }),
    ]);

    expect(list.find("[aria-label]").attributes("aria-label")).toBe(
      "Jason and Kate have watched this",
    );
  });

  test("shows nothing against an episode nobody has watched", async () => {
    const list = await render([season({ episodes: [episode({ watchedBy: [] })] })]);

    expect(list.find("[aria-label]").exists()).toBe(false);
  });
});

describe("asking for a season", () => {
  test("a season nobody has asked for offers to request it", async () => {
    const posted = stubApi();

    await render([season({ state: "unrequested", episodeFileCount: 0 })]);
    await clickText("Request");

    expect(posted[0]).toMatchObject({ url: "/api/requests", method: "POST" });
    expect(JSON.parse(posted[0]!.body!)).toMatchObject({
      mediaType: "series",
      tmdbId: 95396,
      seasonNumber: 1,
    });
  });

  test("a season already asked for offers a retry instead", async () => {
    stubApi();

    const list = await render([
      season({ state: "searching", episodeFileCount: 0, requestedBy: ["Jason"] }),
    ]);

    expect(list.text()).toContain("Retry");
    expect(list.text()).not.toContain("Request");
  });

  test("a complete season has nothing left to ask for", async () => {
    stubApi();

    const list = await render([season({ state: "ready" })]);

    expect(list.text()).not.toContain("Request");
    expect(list.text()).not.toContain("Retry");
  });

  // The single miss: the season is otherwise there, one episode never came in.
  test("a missing episode can be asked for on its own", async () => {
    const posted = stubApi();

    const list = await render([
      season({
        state: "airing",
        episodeFileCount: 1,
        episodes: [episode({ episodeNumber: 7, hasFile: false, airDate: iso(-30) })],
      }),
    ]);
    const buttons = list.findAll("button").filter((button) => button.text() === "Request");
    await buttons[buttons.length - 1]!.trigger("click");
    await flush();

    expect(JSON.parse(posted[0]!.body!)).toMatchObject({ seasonNumber: 1, episodeNumber: 7 });
  });

  test("an episode still to air is not something to chase", async () => {
    stubApi();

    const list = await render([
      season({ episodes: [episode({ hasFile: false, airDate: iso(30) })] }),
    ]);

    expect(list.findAll("button").some((button) => button.text() === "Request")).toBe(false);
  });
});

describe("releasing a season", () => {
  test("an admin may give back a season that is on disk", async () => {
    const posted = stubApi(true);

    await render([season({ sizeOnDisk: 5e9 })], 9);
    await clickText("Release");
    await clickText("Release", '[role="alertdialog"]');

    expect(posted[0]).toMatchObject({
      url: "/api/library/series/9/seasons/1",
      method: "DELETE",
    });
  });

  test("anyone else sees no such button", async () => {
    stubApi(false);

    const list = await render([season({ sizeOnDisk: 5e9 })], 9);

    expect(list.text()).not.toContain("Release");
  });

  test("a season with nothing on disk has nothing to give back", async () => {
    stubApi(true);

    const list = await render([season({ episodeFileCount: 0, state: "searching" })], 9);

    expect(list.text()).not.toContain("Release");
  });
});
