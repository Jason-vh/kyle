import { describe, expect, test } from "vitest";
import { mount } from "@vue/test-utils";
import type { PlexMember } from "#web/api/plex";
import MemberRow from "./MemberRow.vue";

function memberWith(overrides: Partial<PlexMember> = {}): PlexMember {
  return {
    id: "share:501",
    name: "Colin",
    thumb: "",
    status: "member",
    canRemove: false,
    ...overrides,
  };
}

const render = (overrides: Partial<PlexMember> = {}) =>
  mount(MemberRow, { props: { member: memberWith(overrides) } });

describe("MemberRow", () => {
  test("someone still to accept is marked as invited", () => {
    expect(render({ status: "pending" }).text()).toContain("Invited");
  });

  test("the owner is marked as such", () => {
    expect(render({ status: "owner" }).text()).toContain("Owner");
  });

  test("a member wears no badge, being the ordinary case", () => {
    expect(render().text()).not.toContain("Member");
  });

  test("says who to ask about an invitation", () => {
    expect(render({ status: "pending", invitedBy: "Jane" }).text()).toContain("Invited by Jane");
  });

  test("shows an address only when there is one to show", () => {
    expect(render({ email: "colin@plex.test" }).text()).toContain("colin@plex.test");
    expect(render().text()).not.toContain("@");
  });

  test("offers nothing to anyone who may not remove", () => {
    expect(render({ canRemove: false }).find("button").exists()).toBe(false);
  });

  test("takes an invitation back rather than removing a person", () => {
    const row = render({ status: "pending", canRemove: true });

    expect(row.find("button").text()).toBe("Cancel");
  });

  test("removes someone who is already watching", () => {
    const row = render({ canRemove: true });

    expect(row.find("button").text()).toBe("Remove");
  });

  test("asks the page to remove, rather than removing anything itself", async () => {
    const row = render({ canRemove: true });

    await row.find("button").trigger("click");

    expect(row.emitted("remove")).toHaveLength(1);
  });

  test("falls back to initials when Plex has no avatar", () => {
    expect(render({ thumb: "" }).find("img").exists()).toBe(false);
    expect(render({ thumb: "https://plex.test/colin" }).find("img").exists()).toBe(true);
  });
});
