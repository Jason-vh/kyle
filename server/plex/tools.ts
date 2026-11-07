import { Type } from "typebox";
import type { Tool } from "#server/agent/tool.ts";
import { jsonResult } from "#server/agent/tool-result.ts";
import { appOrigin } from "#server/config.ts";
import { plexAccountsOf, plexPersonFor, viewerOf, type Viewer } from "#server/people.ts";
import { episodeLabel } from "#shared/media.ts";
import { getAllPlays, watchKey, type TitlePlay } from "./history.ts";
import { getWatchTime } from "./watch-time.ts";

const MAX_ENTRIES = 50;

export interface Asker {
  userId: string;
  name: string;
  isAdmin: boolean;
}

export interface WatchedEntry {
  person: string;
  you?: boolean;
  title: string;
  mediaType: string;
  link: string;
  plays: number;
  /** Distinct episodes, for a series. */
  episodes?: number;
  latestEpisode?: string;
  firstWatchedAt: string;
  lastWatchedAt: string;
}

function parseDate(value: string): Date {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error(`"${value}" is not an ISO 8601 date`);
  return date;
}

/** Loose, so "sam" finds "Sam Smith" under either the name Kyle or Plex knows them by. */
export function playedBy(play: TitlePlay, person: string, viewer: Viewer): boolean {
  const wanted = person.trim().toLowerCase();
  const names = [play.person.name, viewer.plexNames?.get(play.person.accountId)];
  return names.some((name) => name?.toLowerCase().includes(wanted));
}

function entryOf(plays: TitlePlay[], viewer: Viewer): WatchedEntry | undefined {
  const latest = plays[0];
  const first = plays.at(-1);
  if (!latest || !first) return undefined;

  const [mediaType = "", tmdbId] = latest.key.split(":");
  const { name, you } = plexPersonFor(latest.person, viewer);
  const episodes = new Set(
    plays.flatMap((play) =>
      play.episode ? [`${play.episode.seasonNumber}:${play.episode.episodeNumber}`] : [],
    ),
  );

  const entry: WatchedEntry = {
    person: name,
    title: latest.title ?? "Unknown title",
    mediaType,
    link: `${appOrigin()}/media/${mediaType}/${tmdbId}`,
    plays: plays.length,
    firstWatchedAt: first.at,
    lastWatchedAt: latest.at,
  };
  if (you) entry.you = true;
  if (latest.episode) {
    const { seasonNumber, episodeNumber, title } = latest.episode;
    entry.episodes = episodes.size;
    entry.latestEpisode = episodeLabel(seasonNumber, episodeNumber, title);
  }
  return entry;
}

/** One entry per person per title, most recently watched first; plays arrive newest first. */
export function watchedEntries(plays: TitlePlay[], viewer: Viewer): WatchedEntry[] {
  const groups = new Map<string, TitlePlay[]>();
  for (const play of plays) {
    const group = `${play.person.accountId}|${play.key}`;
    groups.set(group, [...(groups.get(group) ?? []), play]);
  }
  return [...groups.values()]
    .map((group) => entryOf(group, viewer))
    .filter((entry) => entry !== undefined);
}

const watchHistoryParams = Type.Object({
  person: Type.Optional(
    Type.String({
      description: "Only this person's plays: their name as Kyle or Plex knows it, matched loosely",
    }),
  ),
  mediaType: Type.Optional(
    Type.Union([Type.Literal("movie"), Type.Literal("series")], {
      description: "Only plays of one title: its type, given together with tmdbId",
    }),
  ),
  tmdbId: Type.Optional(
    Type.Number({
      description: "Only plays of one title: its TMDB ID, given together with mediaType",
    }),
  ),
  since: Type.Optional(
    Type.String({ description: "Only plays from this ISO 8601 date or time onwards" }),
  ),
});

/** Bound to whoever is asking, since only an administrator may see what others watched. */
export function createWatchHistoryTool(asker?: Asker): Tool<typeof watchHistoryParams> {
  return {
    name: "get_watch_history",
    description: [
      "Who watched what on Plex, and when.",
      "Filter by person, by one title (mediaType with tmdbId), or by date; every filter is optional.",
      "Returns one entry per person per title, most recently watched first, with how often it was played and, for a series, how many distinct episodes and the latest one.",
      "Plex only records a play once it counts as watched, and drops the plays of titles no longer on the server.",
      "Without a title, only an administrator sees other people's plays; anyone else sees only their own.",
    ].join(" "),
    parameters: watchHistoryParams,
    label: "Checking watch history",
    summary: "Checked watch history",
    async execute(params) {
      if (!asker) throw new Error("Watch history needs to know who is asking");
      if ((params.mediaType === undefined) !== (params.tmdbId === undefined)) {
        throw new Error("Give mediaType and tmdbId together, or neither");
      }

      const since = params.since === undefined ? undefined : parseDate(params.since).toISOString();
      const title =
        params.mediaType && params.tmdbId !== undefined
          ? watchKey(params.mediaType, params.tmdbId)
          : undefined;
      const [plays, viewer] = await Promise.all([
        getAllPlays(),
        viewerOf({ id: asker.userId, name: asker.name }),
      ]);

      let matching = plays.filter(
        (play) =>
          (title === undefined || play.key === title) &&
          (since === undefined || play.at >= since) &&
          (params.person === undefined || playedBy(play, params.person, viewer)),
      );

      let withheld = false;
      if (title === undefined && !asker.isAdmin) {
        const own = new Set(await plexAccountsOf(asker.userId));
        const visible = matching.filter((play) => own.has(play.person.accountId));
        withheld = visible.length < matching.length;
        matching = visible;
      }

      const entries = watchedEntries(matching, viewer);
      return jsonResult({
        entries: entries.slice(0, MAX_ENTRIES),
        total: entries.length,
        note: withheld
          ? "Other people's plays were left out: only an administrator can see what others watched, unless asking about one title."
          : undefined,
      });
    },
  };
}

const watchTimeParams = Type.Object({
  since: Type.String({ description: "ISO 8601 date or time to count from" }),
});

const getWatchTimeTool: Tool<typeof watchTimeParams> = {
  name: "get_watch_time",
  description:
    "How long everyone together has watched on Plex since a point in time: total minutes and plays. A play counts at the item's full runtime once Plex marks it watched; a deleted item still counts as a play but adds no minutes.",
  parameters: watchTimeParams,
  label: "Checking watch time",
  summary: "Checked watch time",
  async execute(params) {
    const since = parseDate(params.since);
    const { minutes, plays } = await getWatchTime(since);
    return jsonResult({
      since: since.toISOString(),
      minutes,
      hours: Math.round(minutes / 6) / 10,
      plays,
    });
  },
};

export const plexTools = [getWatchTimeTool];
