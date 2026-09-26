import type { Component } from "vue";

/** One row of a title's or a season's menu. */
export interface MenuAction {
  label: string;
  /** What it costs or keeps, under the label: "Frees 12 GB". */
  hint?: string;
  icon: Component;
  /** Destroys something, and looks it. */
  danger?: boolean;
  /** The menu closes once this settles, and shows the error if it throws. */
  run: () => unknown;
}
