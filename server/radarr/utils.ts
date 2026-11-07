import type { RadarrHistoryRecord, RadarrMovie, RadarrQueueItem, RadarrRelease } from "./types.ts";
import { datedRelease } from "#server/time/days.ts";

export const toPartialMovie = (movie: RadarrMovie) => {
  return {
    id: movie.id,
    title: movie.title,
    year: movie.year,
    status: movie.status,
    hasFile: movie.hasFile,
    monitored: movie.monitored,
    sizeOnDisk: movie.sizeOnDisk ?? 0,
    tmdbId: movie.tmdbId,
    imdbId: movie.imdbId,
    quality: movie.movieFile?.quality?.quality?.name || "no file",
    isAvailable: movie.isAvailable,
  };
};

/** One movie in full, with each release dated against today. */
export const toMovieDetails = (movie: RadarrMovie, today: string) => {
  return {
    ...toPartialMovie(movie),
    minimumAvailability: movie.minimumAvailability,
    releases: {
      cinema: datedRelease(movie.inCinemas, today),
      digital: datedRelease(movie.digitalRelease, today),
      physical: datedRelease(movie.physicalRelease, today),
    },
  };
};

export const toMovieLookupResult = (movie: RadarrMovie) => {
  return {
    title: movie.title,
    year: movie.year,
    status: movie.status,
    overview: movie.overview,
    tmdbId: movie.tmdbId,
    imdbId: movie.imdbId,
  };
};

export const toPartialQueueItem = (item: RadarrQueueItem) => {
  return {
    id: item.id,
    movie: toPartialMovie(item.movie),
    status: item.status,
    trackedDownloadStatus: item.trackedDownloadStatus,
    trackedDownloadState: item.trackedDownloadState,
    ...(item.statusMessages?.length ? { statusMessages: item.statusMessages } : {}),
    ...(item.errorMessage ? { errorMessage: item.errorMessage } : {}),
    ...(item.outputPath ? { outputPath: item.outputPath } : {}),
    ...(item.downloadId ? { downloadId: item.downloadId } : {}),
    timeLeft: item.timeleft,
    quality: item.quality.quality.name,
  };
};

export const toPartialHistoryRecord = (record: RadarrHistoryRecord) => {
  return {
    id: record.id,
    ...(record.movie ? { movie: toPartialMovie(record.movie) } : {}),
    sourceTitle: record.sourceTitle,
    date: record.date,
    eventType: record.eventType,
    quality: record.quality.quality.name,
  };
};

const GB = 1024 ** 3;

const toPartialRelease = (release: RadarrRelease) => {
  return {
    title: release.title,
    quality: release.quality.quality.name,
    sizeGb: Math.round((release.size / GB) * 10) / 10,
    protocol: release.protocol,
    ...(release.protocol === "torrent" ? { seeders: release.seeders ?? 0 } : {}),
    indexer: release.indexer,
    ageDays: Math.floor(release.ageHours / 24),
    ...(release.rejections.length ? { rejections: release.rejections } : {}),
  };
};

const SHOWN_APPROVED = 8;
const SHOWN_REJECTED = 5;

/** The best releases Radarr would take, and the best it would refuse with why; Radarr ranks them already. */
export const summarizeReleases = (releases: RadarrRelease[]) => {
  const approved = releases.filter((release) => release.approved);
  const rejected = releases.filter((release) => !release.approved);
  return {
    total: releases.length,
    approvedCount: approved.length,
    approved: approved.slice(0, SHOWN_APPROVED).map(toPartialRelease),
    rejected: rejected.slice(0, SHOWN_REJECTED).map(toPartialRelease),
  };
};
