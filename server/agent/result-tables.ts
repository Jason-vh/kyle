import { episodeLabel, titleWithYear } from "../../shared/media.ts";
import { safeJsonParse } from "../json.ts";

/** Tabular data pulled out of a tool result, ready to render however a client likes. */
export interface ResultTable {
  caption: string;
  headers: string[];
  rows: string[][];
}

/** Keeps messages readable; Kyle's prose covers anything past this. */
const MAX_ROWS = 10;

interface QueuedMovie {
  movie?: { title?: string; year?: number };
  status?: string;
  trackedDownloadState?: string;
  timeLeft?: string;
  quality?: string;
}

interface QueuedEpisode {
  series?: { title?: string };
  episode?: { seasonNumber?: number; episodeNumber?: number; title?: string };
  status?: string;
  trackedDownloadState?: string;
  estimatedCompletionTime?: string;
  quality?: string;
}

interface CalendarEpisode {
  series?: { title?: string };
  seasonNumber?: number;
  episodeNumber?: number;
  title?: string;
  airDate?: string;
  hasFile?: boolean;
}

/**
 * Turn a queue or calendar tool result into a table.
 *
 * These results are inherently tabular and read poorly as prose, so Slack shows
 * them as a real table. Everything else returns undefined.
 */
export function extractTable(
  toolName: string,
  result: { content?: Array<{ type: string; text?: string }> },
): ResultTable | undefined {
  const parsed = parseResult(result);
  if (!parsed) return undefined;

  switch (toolName) {
    case "get_movie_queue":
      return movieQueueTable(asArray<QueuedMovie>(parsed, "downloads"));
    case "get_series_queue":
      return seriesQueueTable(asArray<QueuedEpisode>(parsed, "items"));
    case "get_calendar":
      return calendarTable(Array.isArray(parsed) ? (parsed as CalendarEpisode[]) : []);
    default:
      return undefined;
  }
}

function movieQueueTable(items: QueuedMovie[]): ResultTable | undefined {
  if (items.length === 0) return undefined;
  return {
    caption: caption("Download queue", items.length),
    headers: ["Movie", "Status", "Time left", "Quality"],
    rows: items
      .slice(0, MAX_ROWS)
      .map((item) => [
        titleWithYear(item.movie?.title, item.movie?.year),
        item.trackedDownloadState ?? item.status ?? "—",
        item.timeLeft ?? "—",
        item.quality ?? "—",
      ]),
  };
}

function seriesQueueTable(items: QueuedEpisode[]): ResultTable | undefined {
  if (items.length === 0) return undefined;
  return {
    caption: caption("Download queue", items.length),
    headers: ["Series", "Episode", "Status", "Quality"],
    rows: items
      .slice(0, MAX_ROWS)
      .map((item) => [
        item.series?.title ?? "—",
        episodeLabel(item.episode?.seasonNumber, item.episode?.episodeNumber, item.episode?.title),
        item.trackedDownloadState ?? item.status ?? "—",
        item.quality ?? "—",
      ]),
  };
}

function calendarTable(episodes: CalendarEpisode[]): ResultTable | undefined {
  if (episodes.length === 0) return undefined;
  return {
    caption: caption("Upcoming episodes", episodes.length),
    headers: ["Series", "Episode", "Airs", "Have it"],
    rows: episodes
      .slice(0, MAX_ROWS)
      .map((episode) => [
        episode.series?.title ?? "—",
        episodeLabel(episode.seasonNumber, episode.episodeNumber, episode.title),
        episode.airDate ?? "—",
        episode.hasFile ? "Yes" : "No",
      ]),
  };
}

function caption(label: string, total: number): string {
  return total > MAX_ROWS ? `${label} (${MAX_ROWS} of ${total})` : label;
}

function parseResult(result: {
  content?: Array<{ type: string; text?: string }>;
}): unknown | undefined {
  const text = result.content?.find((c) => c.type === "text")?.text;
  return text ? safeJsonParse(text) : undefined;
}

function asArray<T>(parsed: unknown, key: string): T[] {
  if (typeof parsed !== "object" || parsed === null) return [];
  const value = (parsed as Record<string, unknown>)[key];
  return Array.isArray(value) ? (value as T[]) : [];
}
