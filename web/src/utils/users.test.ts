import { describe, expect, test } from "vitest";
import type { AdminUser, UserFootprint } from "#shared/types";
import { hasHistory, historySummary, signInSummary } from "./users";

const none: UserFootprint = {
  identities: 0,
  passkeys: 0,
  requests: 0,
  conversations: 0,
  messages: 0,
  mediaEvents: 0,
  movieSubscriptions: 0,
  seriesSubscriptions: 0,
  notifications: 0,
  plexInvites: 0,
  removals: 0,
  plexAccounts: 0,
};

function person(overrides: Partial<AdminUser> = {}): AdminUser {
  return {
    id: "u1",
    displayName: "Jordan",
    isAdmin: false,
    createdAt: "2026-03-01T00:00:00Z",
    identities: [],
    footprint: none,
    ...overrides,
  };
}

describe("people summaries", () => {
  test("say how someone signs in", () => {
    const jordan = person({
      identities: [{ id: "i1", platform: "slack", platformUserId: "U1", platformUsername: null }],
      footprint: { ...none, passkeys: 2 },
    });
    expect(signInSummary(jordan)).toBe("Slack · 2 passkeys");
    expect(signInSummary(person())).toBe("No way to sign in");
  });

  test("say what someone would take with them", () => {
    const footprint = { ...none, requests: 11, conversations: 1, movieSubscriptions: 2 };
    expect(historySummary(footprint)).toBe("11 requests · 1 conversation · 2 subscriptions");
    expect(historySummary(none)).toBe("No history");
  });

  test("count only history, not ways to sign in", () => {
    expect(hasHistory({ ...none, passkeys: 1, identities: 2 })).toBe(false);
    expect(hasHistory({ ...none, notifications: 1 })).toBe(true);
  });
});
