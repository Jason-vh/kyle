import type { ToolCall } from "@mariozechner/pi-ai";

/** One-line, past-tense description of a tool call for the thread viewer. */
export function toolSummary(tc: ToolCall): string {
  const a = tc.arguments as Record<string, unknown>;
  switch (tc.name) {
    case "search_tmdb_movies":
      return `Searched TMDB movies for '${a.query}'`;
    case "search_tmdb_series":
      return `Searched TMDB series for '${a.query}'`;
    case "search_tmdb":
      return `Searched TMDB for '${a.query}'`;
    case "get_tmdb_movie_details":
      return "Fetched TMDB movie details";
    case "get_tmdb_series_details":
      return "Fetched TMDB series details";
    case "get_all_series":
      return "Checked TV library";
    case "get_series_by_id":
      return "Fetched series details";
    case "search_series":
      return `Searched for series '${a.title}'`;
    case "add_series":
      return a.title ? `Added '${a.title}' to Sonarr` : "Added series to Sonarr";
    case "remove_series":
      return "Removed series from Sonarr";
    case "remove_season":
      return "Removed season from Sonarr";
    case "get_episodes":
      return "Fetched episode list";
    case "get_series_queue":
      return "Checked download queue (TV)";
    case "get_calendar":
      return "Checked upcoming episodes";
    case "download_episodes":
    case "search_episodes":
      return "Searched for missing episodes";
    case "get_series_history":
      return "Checked series history";
    case "manual_import":
      return a.importAll ? "Force-importing downloaded files" : "Checking import candidates";
    case "get_all_movies":
      return "Checked movie library";
    case "get_radarr_movie":
      return "Fetched movie details";
    case "search_movies":
      return `Searched for movie '${a.title}'`;
    case "add_movie":
      return a.title ? `Added '${a.title}' to Radarr` : "Added movie to Radarr";
    case "remove_movie":
      return "Removed movie from Radarr";
    case "get_movie_queue":
      return "Checked download queue (movies)";
    case "get_movie_history":
      return "Checked movie history";
    case "get_ultra_stats":
      return "Checked seedbox stats";
    case "get_torrents":
      return "Listed torrents";
    case "delete_torrents":
      return "Deleted torrents";
    case "share_conversation":
      return "Generated share link";
    case "convert_time": {
      const from =
        String(a.fromTimezone ?? "")
          .split("/")
          .pop()
          ?.replace(/_/g, " ") ?? "";
      const to =
        String(a.toTimezone ?? "")
          .split("/")
          .pop()
          ?.replace(/_/g, " ") ?? "";
      return `Converted ${a.time} from ${from} to ${to}`;
    }
    case "web_search":
      return `Searched the web for '${a.query}'`;
    case "unsubscribe_notifications":
      return `Unsubscribed from notifications for '${a.title}'`;
    default:
      return tc.name.replace(/_/g, " ");
  }
}
