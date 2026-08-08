import { Type } from "@sinclair/typebox";
import type { AgentTool } from "@mariozechner/pi-agent-core";
import { jsonResult } from "../agent/tool-result.ts";
import { episodeCode } from "../../shared/media.ts";
import * as sonarr from "./api.ts";
import {
  toPartialSeries,
  toSeriesLookupResult,
  toPartialEpisode,
  toPartialQueueItem,
  toPartialCalendarEpisode,
  toPartialHistoryItem,
  toPartialManualImportItem,
} from "./utils.ts";

const emptyParams = Type.Object({});

export const getAllSeriesTool: AgentTool<typeof emptyParams> = {
  name: "get_all_series",
  description: "Get all TV series currently in the Sonarr library",
  parameters: emptyParams,
  label: "Fetching series from Sonarr",
  async execute() {
    const series = await sonarr.getAllSeries();
    return jsonResult(series.map(toPartialSeries));
  },
};

const getSeriesByIdParams = Type.Object({
  seriesId: Type.Number({
    description: "The ID of the series to get information about",
  }),
});

export const getSeriesByIdTool: AgentTool<typeof getSeriesByIdParams> = {
  name: "get_series_by_id",
  description: "Get information about a specific TV series in Sonarr by ID",
  parameters: getSeriesByIdParams,
  label: "Checking series details in Sonarr",
  async execute(_toolCallId, params) {
    const series = await sonarr.getSeries(params.seriesId);
    return jsonResult(toPartialSeries(series));
  },
};

const searchSeriesParams = Type.Object({
  title: Type.String({
    description: "The title of the TV series to search for",
  }),
});

export const searchSeriesTool: AgentTool<typeof searchSeriesParams> = {
  name: "search_series",
  description:
    "Search for TV series in external databases (TVDB). Returns lookup results, not library entries — use get_all_series to check what's already in the library.",
  parameters: searchSeriesParams,
  label: "Searching for series in Sonarr",
  async execute(_toolCallId, params) {
    const series = await sonarr.searchSeries(params.title);
    return jsonResult(series.map(toSeriesLookupResult));
  },
};

const addSeriesParams = Type.Object({
  title: Type.String({ description: "The title of the series to add" }),
  year: Type.Number({ description: "The year the series started" }),
  tvdbId: Type.Number({ description: "The TVDB ID of the series to add" }),
  monitorOption: Type.Union(
    [
      Type.Literal("all"),
      Type.Literal("future"),
      Type.Literal("missing"),
      Type.Literal("existing"),
      Type.Literal("pilot"),
      Type.Literal("firstSeason"),
      Type.Literal("lastSeason"),
      Type.Literal("monitorSpecials"),
      Type.Literal("none"),
    ],
    {
      description:
        "Which episodes to monitor and download: 'all' (entire series), 'lastSeason' (latest season only), 'firstSeason' (first season only), 'future' (upcoming episodes), 'missing' (missing episodes), 'existing' (existing episodes), 'pilot' (pilot episode only), 'monitorSpecials' (specials only), 'none' (don't download)",
    },
  ),
});

export const addSeriesTool: AgentTool<typeof addSeriesParams> = {
  name: "add_series",
  description:
    "Add a TV series to Sonarr. Requires title, year, TVDB ID, and monitor option. The monitor option determines which episodes to download: 'all' for entire series, 'lastSeason' for only the latest season, 'future' for upcoming episodes only, 'missing' for missing episodes, 'existing' for existing episodes, or 'none' to add without downloading.",
  parameters: addSeriesParams,
  label: "Adding series to Sonarr",
  async execute(_toolCallId, params) {
    const series = await sonarr.addSeries(
      params.title,
      params.year,
      params.tvdbId,
      params.monitorOption,
    );
    const result = toPartialSeries(series);
    return jsonResult({
      series: result,
      message: `Added "${params.title}" (${params.year}) to Sonarr.`,
    });
  },
};

const removeSeriesParams = Type.Object({
  seriesId: Type.Number({
    description: "The ID of the series to remove",
  }),
});

export const removeSeriesTool: AgentTool<typeof removeSeriesParams> = {
  name: "remove_series",
  description: "Remove a TV series from Sonarr and delete the files from disk",
  parameters: removeSeriesParams,
  label: "Removing series from Sonarr",
  async execute(_toolCallId, params) {
    const series = await sonarr.getSeries(params.seriesId);
    await sonarr.removeSeries(params.seriesId, true);
    return jsonResult({
      success: true,
      message: `Removed ${series.title} (${series.year}) from Sonarr and deleted files from disk.`,
      title: series.title,
      tvdbId: series.tvdbId,
      tmdbId: series.tmdbId,
      imdbId: series.imdbId,
      titleSlug: series.titleSlug,
      sonarrId: params.seriesId,
    });
  },
};

const removeSeasonParams = Type.Object({
  seriesId: Type.Number({ description: "The ID of the series" }),
  seasonNumber: Type.Number({
    description: "The season number to remove (e.g., 1 for Season 1, 0 for Specials)",
  }),
});

export const removeSeasonTool: AgentTool<typeof removeSeasonParams> = {
  name: "remove_season",
  description:
    "Remove a specific season from a TV series in Sonarr and delete all episode files from disk",
  parameters: removeSeasonParams,
  label: "Removing season from Sonarr",
  async execute(_toolCallId, params) {
    const series = await sonarr.getSeries(params.seriesId);
    const episodes = await sonarr.getEpisodes(params.seriesId);

    // Filter to episodes in the target season that have files
    const seasonEpisodes = episodes.filter(
      (ep) => ep.seasonNumber === params.seasonNumber && ep.hasFile && ep.episodeFileId,
    );

    // Delete all episode files for this season
    for (const episode of seasonEpisodes) {
      if (episode.episodeFileId) {
        await sonarr.deleteEpisodeFile(episode.episodeFileId);
      }
    }

    // Unmonitor the season
    const season = series.seasons.find((s) => s.seasonNumber === params.seasonNumber);

    if (!season) {
      throw new Error(`Season ${params.seasonNumber} not found in series ${params.seriesId}`);
    }

    season.monitored = false;
    await sonarr.updateSeries(params.seriesId, series);

    return jsonResult({
      success: true,
      message:
        seasonEpisodes.length > 0
          ? `Removed season ${params.seasonNumber} from series ${params.seriesId}, deleted ${seasonEpisodes.length} episode file${seasonEpisodes.length === 1 ? "" : "s"} and unmonitored the season`
          : `Unmonitored season ${params.seasonNumber} from series ${params.seriesId} (no files to delete)`,
      filesDeleted: seasonEpisodes.length,
      title: series.title,
      tvdbId: series.tvdbId,
      tmdbId: series.tmdbId,
      titleSlug: series.titleSlug,
      sonarrId: params.seriesId,
      seasonNumber: params.seasonNumber,
    });
  },
};

const getEpisodesParams = Type.Object({
  seriesId: Type.Number({
    description: "The ID of the series to get episodes for",
  }),
  hasFile: Type.Optional(
    Type.Boolean({
      description:
        "Filter by file status: true = only episodes with files downloaded, false = only episodes without files. Omit to return all episodes.",
    }),
  ),
});

export const getEpisodesTool: AgentTool<typeof getEpisodesParams> = {
  name: "get_episodes",
  description: "Get episodes for a specific TV series",
  parameters: getEpisodesParams,
  label: "Fetching episodes from Sonarr",
  async execute(_toolCallId, params) {
    const episodes = await sonarr.getEpisodes(params.seriesId);
    const mapped = episodes.map(toPartialEpisode);
    const results =
      params.hasFile !== undefined ? mapped.filter((ep) => ep.hasFile === params.hasFile) : mapped;
    return jsonResult(results);
  },
};

const getSeriesQueueParams = Type.Object({
  seriesId: Type.Optional(
    Type.Number({
      description: "Filter queue to a specific series ID. Omit to see all queued items.",
    }),
  ),
});

export const getSeriesQueueTool: AgentTool<typeof getSeriesQueueParams> = {
  name: "get_series_queue",
  description: "Get TV series episodes currently downloading or in the queue",
  parameters: getSeriesQueueParams,
  label: "Checking Sonarr download queue",
  async execute(_toolCallId, params) {
    const queueResponse = await sonarr.getQueue({
      seriesIds: params.seriesId ? [params.seriesId] : undefined,
    });
    const queueItems = queueResponse.records.map(toPartialQueueItem);

    if (queueItems.length === 0) {
      return jsonResult({ message: "No downloads in progress" });
    }

    return jsonResult({
      totalRecords: queueResponse.totalRecords,
      items: queueItems,
    });
  },
};

const getCalendarParams = Type.Object({
  start: Type.Optional(
    Type.String({
      description: "Start date in ISO format (default: today)",
    }),
  ),
  end: Type.Optional(
    Type.String({
      description: "End date in ISO format (default: 7 days from start)",
    }),
  ),
  includeSeries: Type.Optional(
    Type.Boolean({
      description: "Include series information with each episode",
      default: true,
    }),
  ),
});

export const getCalendarTool: AgentTool<typeof getCalendarParams> = {
  name: "get_calendar",
  description: "Get upcoming episodes from the calendar for a date range",
  parameters: getCalendarParams,
  label: "Checking Sonarr calendar",
  async execute(_toolCallId, params) {
    const includeSeries = params.includeSeries ?? true;
    const episodes = await sonarr.getCalendar(params.start, params.end, includeSeries);
    return jsonResult(episodes.map(toPartialCalendarEpisode));
  },
};

const searchEpisodesParams = Type.Object({
  seriesId: Type.Optional(
    Type.Number({
      description: "The ID of the series to search for missing episodes",
    }),
  ),
  seasonNumber: Type.Optional(
    Type.Number({
      description:
        "The season number to search (requires seriesId). Auto-monitors unmonitored episodes before searching.",
    }),
  ),
  episodeIds: Type.Optional(
    Type.Array(Type.Number(), {
      description: "Array of specific episode IDs to search for",
    }),
  ),
});

export const downloadEpisodesTool: AgentTool<typeof searchEpisodesParams> = {
  name: "download_episodes",
  description:
    "Search indexers and download missing episodes for a series, a specific season, or specific episodes. When seasonNumber is provided with seriesId, automatically monitors unmonitored episodes before searching.",
  parameters: searchEpisodesParams,
  label: "Downloading episodes from Sonarr",
  async execute(_toolCallId, params) {
    const monitoringActions: string[] = [];

    // Season-specific search with auto-monitoring
    if (params.seriesId && params.seasonNumber !== undefined) {
      const [series, episodes] = await Promise.all([
        sonarr.getSeries(params.seriesId),
        sonarr.getEpisodes(params.seriesId),
      ]);

      const seasonEpisodes = episodes.filter((ep) => ep.seasonNumber === params.seasonNumber);

      if (seasonEpisodes.length === 0) {
        return jsonResult({
          error: `Season ${params.seasonNumber} has no episodes in series ${series.title}`,
        });
      }

      // Auto-monitor the season on the series if needed
      const season = series.seasons.find((s) => s.seasonNumber === params.seasonNumber);
      if (season && !season.monitored) {
        season.monitored = true;
        await sonarr.updateSeries(params.seriesId, series);
        monitoringActions.push(`Monitored season ${params.seasonNumber} on ${series.title}`);
      }

      // Auto-monitor individual episodes if needed
      const unmonitoredIds = seasonEpisodes.filter((ep) => !ep.monitored).map((ep) => ep.id);
      if (unmonitoredIds.length > 0) {
        await sonarr.monitorEpisodes(unmonitoredIds, true);
        monitoringActions.push(
          `Monitored ${unmonitoredIds.length} episode${unmonitoredIds.length === 1 ? "" : "s"}`,
        );
      }

      const command = await sonarr.searchEpisodes(params.seriesId, undefined, params.seasonNumber);
      return jsonResult({
        commandId: command.id,
        status: command.status,
        message: `SeasonSearch queued for ${series.title} season ${params.seasonNumber}`,
        seriesId: series.id,
        seriesTitle: series.title,
        tvdbId: series.tvdbId,
        ...(monitoringActions.length > 0 ? { monitoringActions } : {}),
      });
    }

    // Episode-specific search with auto-monitoring
    if (params.episodeIds && params.episodeIds.length > 0) {
      const monitoredEpisodes = await sonarr.monitorEpisodes(params.episodeIds, true);
      const seriesId = monitoredEpisodes[0]?.seriesId;
      const [command, series] = await Promise.all([
        sonarr.searchEpisodes(undefined, params.episodeIds),
        seriesId ? sonarr.getSeries(seriesId) : Promise.resolve(undefined),
      ]);
      return jsonResult({
        commandId: command.id,
        status: command.status,
        message: `EpisodeSearch queued for ${params.episodeIds.length} episode${params.episodeIds.length === 1 ? "" : "s"}`,
        ...(series
          ? { seriesId: series.id, seriesTitle: series.title, tvdbId: series.tvdbId }
          : {}),
      });
    }

    // Series-wide search (no auto-monitoring)
    if (params.seriesId) {
      const [command, series] = await Promise.all([
        sonarr.searchEpisodes(params.seriesId),
        sonarr.getSeries(params.seriesId),
      ]);
      return jsonResult({
        commandId: command.id,
        status: command.status,
        message: `SeriesSearch queued for series ${params.seriesId}`,
        seriesId: series.id,
        seriesTitle: series.title,
        tvdbId: series.tvdbId,
      });
    }

    throw new Error("Must provide either seriesId or episodeIds");
  },
};

const getSeriesHistoryParams = Type.Object({
  seriesId: Type.Optional(
    Type.Number({
      description:
        "Filter history to a specific series ID. Uses a dedicated endpoint that returns all history for the series (no pagination needed). Omit for global history.",
    }),
  ),
  page: Type.Optional(
    Type.Number({
      description: "Page number for pagination (global history only, ignored when seriesId is set)",
      default: 1,
    }),
  ),
  pageSize: Type.Optional(
    Type.Number({
      description: "Number of items per page (global history only, ignored when seriesId is set)",
      default: 20,
    }),
  ),
});

export const getSeriesHistoryTool: AgentTool<typeof getSeriesHistoryParams> = {
  name: "get_series_history",
  description:
    "Get download and import history from Sonarr. When investigating a specific series, pass seriesId to get all history for that series.",
  parameters: getSeriesHistoryParams,
  label: "Checking Sonarr history",
  async execute(_toolCallId, params) {
    // Series-specific history uses a dedicated endpoint
    if (params.seriesId) {
      const items = await sonarr.getSeriesHistory(params.seriesId);
      return jsonResult({
        totalRecords: items.length,
        items: items.map(toPartialHistoryItem),
      });
    }

    // Global history with pagination
    const page = params.page ?? 1;
    const pageSize = params.pageSize ?? 20;

    const historyResponse = await sonarr.getHistory(page, pageSize);

    return jsonResult({
      totalRecords: historyResponse.totalRecords,
      page: historyResponse.page,
      pageSize: historyResponse.pageSize,
      items: historyResponse.records.map(toPartialHistoryItem),
    });
  },
};

const manualImportParams = Type.Object({
  downloadId: Type.String({
    description:
      "The download client ID (from the queue item's downloadId field). Used to find files eligible for import.",
  }),
  seriesId: Type.Optional(
    Type.Number({
      description: "The series ID to scope the import to",
    }),
  ),
  importAll: Type.Optional(
    Type.Boolean({
      description:
        "If true, immediately import all eligible files (those without rejections and with matched episodes). If false or omitted, just list what's available for import.",
      default: false,
    }),
  ),
});

export const manualImportTool: AgentTool<typeof manualImportParams> = {
  name: "manual_import",
  description:
    "Inspect and force-import downloaded files that are stuck in the queue (downloaded but not imported). First call without importAll to see what files are available and any rejections, then call with importAll=true to import them.",
  parameters: manualImportParams,
  label: "Checking manual import candidates",
  async execute(_toolCallId, params) {
    const items = await sonarr.getManualImport(params.downloadId, params.seriesId);

    if (items.length === 0) {
      return jsonResult({
        message: "No files found for manual import with this download ID",
      });
    }

    // List-only mode
    if (!params.importAll) {
      return jsonResult({
        totalFiles: items.length,
        files: items.map(toPartialManualImportItem),
      });
    }

    // Import mode — filter to files that have matched episodes and no rejections
    const importable = items.filter(
      (item) =>
        item.series &&
        item.episodes &&
        item.episodes.length > 0 &&
        item.rejections.length === 0 &&
        item.seasonNumber !== undefined,
    );

    if (importable.length === 0) {
      return jsonResult({
        message:
          "No files eligible for automatic import (missing episode match or have rejections)",
        totalFiles: items.length,
        files: items.map(toPartialManualImportItem),
      });
    }

    const command = await sonarr.triggerManualImport(
      importable.map((item) => ({
        path: item.path,
        seriesId: item.series!.id,
        seasonNumber: item.seasonNumber!,
        episodeIds: item.episodes!.map((ep) => ep.id),
        quality: item.quality,
        languages: item.languages ?? [],
      })),
    );

    return jsonResult({
      commandId: command.id,
      status: command.status,
      message: `Manual import queued for ${importable.length} file${importable.length === 1 ? "" : "s"}`,
      importedFiles: importable.map((item) => ({
        name: item.name,
        seriesTitle: item.series!.title,
        seasonNumber: item.seasonNumber,
        episodes: item.episodes!.map((ep) => episodeCode(ep.seasonNumber, ep.episodeNumber)),
      })),
      ...(items.length > importable.length
        ? {
            skippedFiles: items.length - importable.length,
            skipped: items
              .filter((item) => !importable.includes(item))
              .map(toPartialManualImportItem),
          }
        : {}),
    });
  },
};
