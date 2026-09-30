/**
 * Kyle wears a different accent now and then. A roll holds for an hour so the
 * colour does not flicker between page loads; after that the next visit rolls
 * again, which may well land on the same one.
 *
 * The colours themselves live in main.css; violet is the theme's own default
 * and so needs no rule of its own there.
 */
export const ACCENTS = ["violet", "indigo", "fuchsia", "pink", "teal", "orange"] as const;

export type Accent = (typeof ACCENTS)[number];

export interface AccentRoll {
  accent: Accent;
  rolledAt: number;
}

const STORAGE_KEY = "kyle-accent";
const HELD_FOR_MS = 60 * 60 * 1000;

export function chooseAccent(
  last: AccentRoll | null,
  now: number,
  random: () => number = Math.random,
): AccentRoll {
  if (last) {
    const age = now - last.rolledAt;
    if (age >= 0 && age < HELD_FOR_MS) return last;
  }

  const accent = ACCENTS[Math.floor(random() * ACCENTS.length)] ?? ACCENTS[0];
  return { accent, rolledAt: now };
}

function isAccent(value: unknown): value is Accent {
  return ACCENTS.includes(value as Accent);
}

/** Anything unreadable, or an accent since dropped from the palette, counts as no roll. */
function readRoll(): AccentRoll | null {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
    if (typeof stored !== "object" || stored === null) return null;

    const { accent, rolledAt } = stored as Record<string, unknown>;
    if (!isAccent(accent) || typeof rolledAt !== "number") return null;

    return { accent, rolledAt };
  } catch {
    return null;
  }
}

/** Runs before the app mounts, so the first paint is already in the rolled colour. */
export function applyAccent(now = Date.now()): Accent {
  const roll = chooseAccent(readRoll(), now);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(roll));
  document.documentElement.dataset.accent = roll.accent;
  return roll.accent;
}
