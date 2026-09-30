import { afterEach, describe, expect, test } from "vitest";
import { ACCENTS, applyAccent, chooseAccent } from "./accent";

const HOUR_MS = 60 * 60 * 1000;
const now = new Date("2026-09-30T12:00:00Z").getTime();

describe("chooseAccent", () => {
  test("keeps the last roll for the rest of the hour", () => {
    const last = { accent: "teal" as const, rolledAt: now - HOUR_MS + 1 };

    expect(chooseAccent(last, now, () => 0)).toBe(last);
  });

  test("rolls again once the hour is up", () => {
    const last = { accent: "teal" as const, rolledAt: now - HOUR_MS };

    expect(chooseAccent(last, now, () => 0)).toEqual({ accent: "violet", rolledAt: now });
  });

  test("rolls on a first visit", () => {
    expect(chooseAccent(null, now, () => 0.99)).toEqual({ accent: "orange", rolledAt: now });
  });

  // A clock set back would otherwise hold one colour until it caught up.
  test("does not trust a roll from the future", () => {
    const last = { accent: "teal" as const, rolledAt: now + HOUR_MS };

    expect(chooseAccent(last, now, () => 0).rolledAt).toBe(now);
  });

  test("can land on every accent in the palette", () => {
    const landed = ACCENTS.map((_, i) => chooseAccent(null, now, () => i / ACCENTS.length).accent);

    expect(landed).toEqual([...ACCENTS]);
  });
});

describe("applyAccent", () => {
  afterEach(() => {
    localStorage.clear();
    delete document.documentElement.dataset.accent;
  });

  test("wears the rolled accent and remembers it", () => {
    const accent = applyAccent(now);

    expect(document.documentElement.dataset.accent).toBe(accent);
    expect(JSON.parse(localStorage.getItem("kyle-accent")!)).toEqual({ accent, rolledAt: now });
  });

  test("a reload within the hour keeps the same accent", () => {
    localStorage.setItem("kyle-accent", JSON.stringify({ accent: "pink", rolledAt: now - 1000 }));

    expect(applyAccent(now)).toBe("pink");
  });

  test("rolls afresh over anything it cannot read", () => {
    localStorage.setItem("kyle-accent", JSON.stringify({ accent: "beige", rolledAt: now }));

    expect(ACCENTS).toContain(applyAccent(now));
    expect(JSON.parse(localStorage.getItem("kyle-accent")!).accent).not.toBe("beige");
  });
});
