import type { EpisodeSummary } from "#shared/types";

/** An episode that has not aired is not missing, it is simply not here yet. */
export function unaired(episode: EpisodeSummary, now = new Date()): boolean {
  return !episode.hasFile && !!episode.airDate && new Date(episode.airDate) > now;
}

/** Where one episode stands, as the season's bar draws it. */
export type EpisodeMark = "present" | "missing" | "pending";

/** Unaired and unwanted both read as "not expected", which is neither here nor missing. */
export function episodeMark(episode: EpisodeSummary, now = new Date()): EpisodeMark {
  if (episode.hasFile) return "present";
  if (unaired(episode, now) || !episode.monitored) return "pending";
  return "missing";
}
