import type { RadarrHistoryRecord, RadarrMovie, RadarrQueueItem } from "./types.ts";

export const toPartialMovie = (movie: RadarrMovie) => {
  return {
    id: movie.id,
    title: movie.title,
    year: movie.year,
    status: movie.status,
    hasFile: movie.hasFile,
    monitored: movie.monitored,
    tmdbId: movie.tmdbId,
    imdbId: movie.imdbId,
    quality: movie.movieFile?.quality?.quality?.name || "no file",
  };
};

export const toPartialQueueItem = (item: RadarrQueueItem) => {
  return {
    id: item.id,
    movie: toPartialMovie(item.movie),
    status: item.status,
    timeLeft: item.timeLeft,
    quality: item.quality.quality.name,
  };
};

export const toPartialHistoryRecord = (record: RadarrHistoryRecord) => {
  return {
    id: record.id,
    movie: toPartialMovie(record.movie!),
    date: record.date,
    eventType: record.eventType,
    quality: record.quality.quality.name,
  };
};
