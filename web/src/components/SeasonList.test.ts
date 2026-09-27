import { afterEach, describe, expect, test, vi } from "vitest";
import { mount, type VueWrapper } from "@vue/test-utils";
import { createPinia } from "pinia";
import { PiniaColada } from "@pinia/colada";
import type { EpisodeSummary, SeasonSummary } from "#shared/types";
import { HOLD_MS } from "#web/directives/longPress";
import SeasonList from "./SeasonList.vue";

const realFetch = globalThis.fetch;

const mounted: VueWrapper[] = [];

afterEach(() => {
  // A menu left open outlives its test otherwise, and patches a document already emptied.
  for (const wrapper of mounted.splice(0)) wrapper.unmount();
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
async function render(seasons: SeasonSummary[], serviceId?: number, canManage = false) {
  const list = mount(SeasonList, {
    props: { seasons, tmdbId: 95396, posterPath: "/p.jpg", serviceId, canManage },
    global: { plugins: [createPinia(), [PiniaColada, {}]] },
    attachTo: document.body,
  });
  mounted.push(list);
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

/** A menu item carries its consequence under its label, so it is found by how it starts. */
const clickMenuItem = async (label: string) => {
  const button = [...document.querySelectorAll('[role="dialog"] button')].find((candidate) =>
    candidate.textContent?.trim().startsWith(label),
  );
  (button as HTMLButtonElement).click();
  await flush();
};

const menuButton = (seasonNumber = 1) =>
  document.querySelector<HTMLButtonElement>(`[aria-label="Season ${seasonNumber} options"]`);

const openMenu = async (seasonNumber = 1) => {
  menuButton(seasonNumber)!.click();
  await flush();
};

const menuText = () => document.querySelector('[role="dialog"]')?.textContent ?? "";

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
    expect(list.text()).toContain("1 of 10");
  });

  test("a complete season says nothing beyond its count", async () => {
    const list = await render([season({ state: "ready" })]);
    expect(list.text()).not.toContain("Ready");
  });

  test.each([
    ["searching", "Looking"],
    ["stalled", "Stalled"],
    ["unrequested", "Not requested"],
    ["unreleased", "Not aired yet"],
  ] as const)("%s reads as %s", async (state, label) => {
    expect((await render([season({ state })])).text()).toContain(label);
  });

  test("says when the next episode of a season still airing arrives", async () => {
    const list = await render([season({ state: "airing", expectedAt: iso(7) })]);

    expect(list.text()).toContain("next");
  });

  test("draws one segment per episode", async () => {
    const list = await render([
      season({ episodes: [episode(), episode({ episodeNumber: 2, hasFile: false })] }),
    ]);

    expect(list.findAll('[role="img"] > span')).toHaveLength(2);
  });

  // The distinction the page exists to make: nothing is wrong with an episode
  // that has not aired, and everything is wrong with one that has.
  test("an episode on disk says it is downloaded", async () => {
    const list = await render([season({ episodes: [episode({ hasFile: true })] })]);
    expect(list.find('[aria-label="Downloaded"]').exists()).toBe(true);
  });

  test("an episode still to air says when, not that it is missing", async () => {
    const list = await render([
      season({ episodes: [episode({ hasFile: false, airDate: iso(30) })] }),
    ]);

    expect(list.text()).not.toContain("Missing");
  });

  test("an episode that aired and never arrived is missing", async () => {
    const list = await render([
      season({ episodes: [episode({ hasFile: false, airDate: iso(-30) })] }),
    ]);

    expect(list.text()).toContain("Missing");
  });

  test("an episode with no date at all is missing rather than unaired", async () => {
    const list = await render([season({ episodes: [episode({ hasFile: false })] })]);

    expect(list.text()).toContain("Missing");
  });

  test("numbers each episode within its season", async () => {
    const list = await render([
      season({ seasonNumber: 2, episodes: [episode({ episodeNumber: 3 })] }),
    ]);

    expect(list.find("li span").text()).toBe("3");
  });

  test("says so when Sonarr knows the season but not its episodes", async () => {
    const list = await render([season({ episodes: [] })]);
    expect(list.text()).toContain("No episodes listed yet");
  });

  test("shows who has watched an episode", async () => {
    const list = await render([
      season({ episodes: [episode({ watchedBy: [{ name: "Jason" }, { name: "Kate" }] })] }),
    ]);

    expect(list.find("[aria-label$='watched this']").attributes("aria-label")).toBe(
      "Jason and Kate have watched this",
    );
  });

  test("shows nothing against an episode nobody has watched", async () => {
    const list = await render([season({ episodes: [episode({ watchedBy: [] })] })]);

    expect(list.find("[aria-label$='watched this']").exists()).toBe(false);
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

  test("a season still short of episodes can be searched again from its menu", async () => {
    const posted = stubApi();

    const list = await render([
      season({ state: "searching", episodeFileCount: 0, requestedBy: ["Jason"] }),
    ]);
    await openMenu();
    await clickMenuItem("Search again");

    expect(list.text()).not.toContain("Request");
    expect(posted[0]).toMatchObject({
      url: "/api/requests/series/95396/retry?season=1",
      method: "POST",
    });
  });

  test("a complete season has nothing left to ask for", async () => {
    stubApi();

    const list = await render([season({ state: "ready" })]);

    expect(list.text()).not.toContain("Request");
    expect(menuButton()).toBeNull();
  });

  // The single gap: an episode nobody is watching for can be asked for on its own.
  test("an episode nobody asked for can be asked for on its own", async () => {
    const posted = stubApi();

    const list = await render([
      season({
        state: "airing",
        episodeFileCount: 1,
        episodes: [
          episode({ episodeNumber: 7, hasFile: false, monitored: false, airDate: iso(-30) }),
        ],
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
      season({ episodes: [episode({ hasFile: false, monitored: false, airDate: iso(30) })] }),
    ]);

    expect(list.findAll("button").some((button) => button.text() === "Request")).toBe(false);
  });
});

describe("deleting a season", () => {
  test("an admin may delete a season that is on disk", async () => {
    const posted = stubApi(true);

    await render([season({ sizeOnDisk: 5e9 })], 9);
    await openMenu();
    await clickMenuItem("Delete season");
    await clickText("Delete", '[role="alertdialog"]');

    expect(posted[0]).toMatchObject({
      url: "/api/library/series/9/seasons/1",
      method: "DELETE",
    });
  });

  test("the dialog stays, busy, until the season is gone, then closes", async () => {
    stubApi(true);
    const answer = Promise.withResolvers<Response>();
    const signedIn = globalThis.fetch;
    globalThis.fetch = vi.fn((url: string, init?: RequestInit) =>
      init?.method === "DELETE" ? answer.promise : signedIn(url, init),
    ) as unknown as typeof fetch;

    await render([season({ sizeOnDisk: 5e9 })], 9);
    await openMenu();
    await clickMenuItem("Delete season");
    await clickText("Delete", '[role="alertdialog"]');

    const dialog = () => document.querySelector('[role="alertdialog"]');
    expect(dialog()).not.toBeNull();
    expect(dialog()?.querySelector('[aria-busy="true"]')).not.toBeNull();

    answer.resolve(new Response(JSON.stringify({ success: true })));
    await flush();
    await flush();

    expect(dialog()).toBeNull();
  });

  test("a failed deletion is explained in the dialog, which stays open", async () => {
    stubApi(true);
    const signedIn = globalThis.fetch;
    globalThis.fetch = vi.fn((url: string, init?: RequestInit) =>
      init?.method === "DELETE"
        ? Promise.resolve(
            new Response(JSON.stringify({ error: "Sonarr is down" }), { status: 502 }),
          )
        : signedIn(url, init),
    ) as unknown as typeof fetch;

    await render([season({ sizeOnDisk: 5e9 })], 9);
    await openMenu();
    await clickMenuItem("Delete season");
    await clickText("Delete", '[role="alertdialog"]');
    await flush();

    expect(document.querySelector('[role="alertdialog"]')?.textContent).toContain("Sonarr is down");
  });

  test("anyone else has no menu to do it from", async () => {
    stubApi(false);

    await render([season({ sizeOnDisk: 5e9 })], 9);

    expect(menuButton()).toBeNull();
  });

  test("a season with nothing on disk has nothing to delete", async () => {
    stubApi(true);

    await render([season({ episodeFileCount: 0, state: "searching" })], 9);
    await openMenu();

    expect(menuText()).toContain("Search again");
    expect(menuText()).not.toContain("Delete season");
  });
});

describe("monitoring a season", () => {
  test("whoever manages the series may stop a season being looked for", async () => {
    const posted = stubApi();

    await render([season()], 9, true);
    await openMenu();
    await clickMenuItem("Stop monitoring");

    expect(posted[0]).toMatchObject({ url: "/api/library/series/9/seasons/1", method: "PUT" });
    expect(JSON.parse(posted[0]!.body!)).toEqual({ monitored: false });
  });

  test("a season on disk nobody watches for can be looked for again", async () => {
    const posted = stubApi();

    await render([season({ monitored: false, state: "paused" })], 9, true);
    await openMenu();
    await clickMenuItem("Start monitoring");

    expect(JSON.parse(posted[0]!.body!)).toEqual({ monitored: true });
  });

  // Asking for a season nobody wants is what the Request button is for.
  test("a season nobody asked for offers no monitoring of its own", async () => {
    stubApi();

    await render(
      [season({ monitored: false, state: "unrequested", episodeFileCount: 0 })],
      9,
      true,
    );

    expect(menuButton()).toBeNull();
  });

  test("anyone else is not offered it", async () => {
    stubApi();

    await render([season()], 9, false);

    expect(menuButton()).toBeNull();
  });
});

describe("holding a season down", () => {
  const header = () =>
    document.querySelector<HTMLElement>("[data-reka-collection-item]")!.parentElement!
      .parentElement!;

  test("opens its menu, and does not also open the season", async () => {
    stubApi(true);
    const list = await render([season({ sizeOnDisk: 5e9 })], 9, true);
    const openBefore = list.find('[data-state="open"]').exists();

    vi.useFakeTimers();
    header().dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0 }));
    vi.advanceTimersByTime(HOLD_MS);
    header().dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));
    header().querySelector("button")!.click();
    vi.useRealTimers();
    await flush();

    expect(menuText()).toContain("Delete season");
    expect(list.find('[data-state="open"]').exists()).toBe(openBefore);
  });

  test("a quick tap is only a tap", async () => {
    stubApi(true);
    await render([season({ sizeOnDisk: 5e9 })], 9, true);

    vi.useFakeTimers();
    header().dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0 }));
    vi.advanceTimersByTime(HOLD_MS / 2);
    header().dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));
    vi.useRealTimers();
    await flush();

    expect(menuText()).toBe("");
  });
});

describe("a season in the queue", () => {
  test("a downloading season says how far along it is and how long is left", async () => {
    const list = await render([season({ state: "downloading", progress: 0.42, eta: "00:12:31" })]);

    expect(list.text()).toContain("Downloading · 42% · 12 min left");
  });

  test("a stalled season says why, and offers another copy", async () => {
    const posted = stubApi();

    const list = await render([
      season({
        state: "stalled",
        detail: "The download is stalled with no connections",
        progress: 0.1,
        eta: "00:12:31",
        episodeFileCount: 0,
      }),
    ]);
    expect(list.text()).toContain("10%");
    expect(list.text()).not.toContain("left");
    expect(list.text()).toContain("The download is stalled with no connections");

    await openMenu();
    await clickMenuItem("Try another copy");

    expect(posted[0]).toMatchObject({
      url: "/api/requests/series/95396/retry?season=1",
      method: "POST",
    });
  });

  test("a blocked season says why", async () => {
    const list = await render([season({ state: "blocked", detail: "Sample rejected" })]);

    expect(list.text()).toContain("Sample rejected");
  });

  test("a season merely searching says nothing more", async () => {
    const list = await render([season({ state: "searching", detail: "irrelevant" })]);

    expect(list.text()).not.toContain("irrelevant");
  });
});
