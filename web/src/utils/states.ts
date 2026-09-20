import type { RequestState, SeasonState } from "#shared/types";
import type { Tone } from "#web/components/ui/types";

export interface StateBadge {
  label: string;
  tone: Tone;
}

/** The one place a request's state is put into words. */
export const REQUEST_STATES: Record<RequestState, StateBadge> = {
  unreleased: { label: "Not out yet", tone: "neutral" },
  waiting: { label: "In cinemas", tone: "neutral" },
  searching: { label: "Looking", tone: "blue" },
  found: { label: "Found one", tone: "blue" },
  downloading: { label: "Downloading", tone: "amber" },
  stalled: { label: "Stalled", tone: "amber" },
  blocked: { label: "Can't import", tone: "red" },
  importing: { label: "Almost there", tone: "amber" },
  ready: { label: "Ready", tone: "green" },
  paused: { label: "Paused", tone: "neutral" },
  removed: { label: "Gone", tone: "neutral" },
};

/** A season says everything a request says, plus the two only it can say. */
export const SEASON_STATES: Record<SeasonState, StateBadge> = {
  ...REQUEST_STATES,
  unreleased: { label: "Not aired yet", tone: "neutral" },
  unrequested: { label: "Not requested", tone: "neutral" },
  airing: { label: "Airing", tone: "blue" },
};
