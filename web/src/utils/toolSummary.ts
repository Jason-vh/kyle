// Fallback tool summary — server provides summaryText, but this is
// available in case we ever need client-side computation.

export function toolSummary(name: string, args: Record<string, unknown>): string {
  switch (name) {
    case "search_tmdb_movies":
      return `Searched TMDB movies for '${args.query}'`;
    case "search_tmdb_series":
      return `Searched TMDB series for '${args.query}'`;
    case "search_tmdb":
      return `Searched TMDB for '${args.query}'`;
    case "get_tmdb_movie_details":
      return "Fetched TMDB movie details";
    case "get_tmdb_series_details":
      return "Fetched TMDB series details";
    case "get_all_series":
      return "Checked TV library";
    case "get_series_by_id":
      return "Fetched series details";
    case "search_series":
      return `Searched for series '${args.title}'`;
    case "add_series":
      return args.title ? `Added '${args.title}' to Sonarr` : "Added series to Sonarr";
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
    case "search_episodes":
      return "Searched for missing episodes";
    case "get_series_history":
      return "Checked series history";
    case "get_all_movies":
      return "Checked movie library";
    case "get_radarr_movie":
      return "Fetched movie details";
    case "search_movies":
      return `Searched for movie '${args.title}'`;
    case "add_movie":
      return args.title ? `Added '${args.title}' to Radarr` : "Added movie to Radarr";
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
        String(args.fromTimezone ?? "")
          .split("/")
          .pop()
          ?.replace(/_/g, " ") ?? "";
      const to =
        String(args.toTimezone ?? "")
          .split("/")
          .pop()
          ?.replace(/_/g, " ") ?? "";
      return `Converted ${args.time} from ${from} to ${to}`;
    }
    case "web_search":
      return `Searched the web for '${args.query}'`;
    default:
      return name.replace(/_/g, " ");
  }
}
