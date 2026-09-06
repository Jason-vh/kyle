import { describe, expect, test } from "vitest";
import { mount } from "@vue/test-utils";
import type { EpisodeSummary, SeasonSummary } from "#shared/types";
import SeasonList from "./SeasonList.vue";

function episode(overrides: Partial<EpisodeSummary> = {}): EpisodeSummary {
  return { episodeNumber: 1, title: "Good News", hasFile: true, monitored: true, ...overrides };
}

function season(overrides: Partial<SeasonSummary> = {}): SeasonSummary {
  return {
    seasonNumber: 1,
    monitored: true,
    episodeCount: 2,
    episodeFileCount: 2,
    sizeOnDisk: 0,
    episodes: [episode()],
    ...overrides,
  };
}

/** The accordion hides its content until opened, so the test opens it. */
async function render(seasons: SeasonSummary[]) {
  const list = mount(SeasonList, { props: { seasons }, attachTo: document.body });
  for (const trigger of list.findAll("button")) await trigger.trigger("click");
  return list;
}

const DAY = 24 * 60 * 60 * 1000;
const iso = (offsetDays: number) => new Date(Date.now() + offsetDays * DAY).toISOString();

describe("SeasonList", () => {
  test("names season 0 as the specials it is", async () => {
    const list = await render([season({ seasonNumber: 0 })]);
    expect(list.text()).toContain("Specials");
    expect(list.text()).not.toContain("Season 0");
  });

  test("counts what is on disk against what the season holds", async () => {
    const list = await render([season({ episodeFileCount: 1, episodeCount: 10 })]);
    expect(list.text()).toContain("1/10 episodes");
    expect(list.text()).toContain("Partial");
  });

  test.each([
    [{ episodeFileCount: 2, episodeCount: 2 }, "Complete"],
    [{ episodeFileCount: 0, episodeCount: 2 }, "Missing"],
    [{ episodeFileCount: 0, episodeCount: 0 }, "Empty"],
  ])("%o reads as %s", async (counts, label) => {
    expect((await render([season(counts)])).text()).toContain(label);
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
});
