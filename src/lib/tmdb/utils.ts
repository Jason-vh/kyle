import type {
	TMDBMovie,
	TMDBMovieDetails,
	TMDBMultiResult,
	TMDBPerson,
	TMDBTVShow,
	TMDBTVShowDetails,
} from "./types";

/**
 * Transform a full TMDB movie object to a minimal subset for AI context.
 * This reduces token usage while preserving essential information.
 */
export const toPartialMovie = (movie: TMDBMovie) => {
	return {
		id: movie.id,
		title: movie.title,
		overview: movie.overview,
		release_date: movie.release_date,
		vote_average: movie.vote_average,
		popularity: movie.popularity,
	};
};

/**
 * Transform a full TMDB TV show object to a minimal subset for AI context.
 * This reduces token usage while preserving essential information.
 */
export const toPartialTVShow = (show: TMDBTVShow) => {
	return {
		id: show.id,
		name: show.name,
		overview: show.overview,
		first_air_date: show.first_air_date,
		vote_average: show.vote_average,
		popularity: show.popularity,
	};
};

/**
 * Transform a multi-search result to a minimal subset.
 * Handles movies, TV shows, and people appropriately.
 */
export const toPartialMultiResult = (result: TMDBMultiResult) => {
	const base = {
		id: result.id,
		media_type: result.media_type,
		popularity: result.popularity,
	};

	if (result.media_type === "movie") {
		return {
			...base,
			title: (result as TMDBMovie).title,
			overview: (result as TMDBMovie).overview,
			release_date: (result as TMDBMovie).release_date,
			vote_average: (result as TMDBMovie).vote_average,
		};
	}

	if (result.media_type === "tv") {
		return {
			...base,
			name: (result as TMDBTVShow).name,
			overview: (result as TMDBTVShow).overview,
			first_air_date: (result as TMDBTVShow).first_air_date,
			vote_average: (result as TMDBTVShow).vote_average,
		};
	}

	// person
	return {
		...base,
		name: (result as TMDBPerson).name,
		known_for_department: (result as TMDBPerson).known_for_department,
	};
};

/**
 * Transform detailed movie information to a minimal subset for AI context.
 * Includes additional details like runtime, budget, genres, etc.
 */
export const toPartialMovieDetails = (movie: TMDBMovieDetails) => {
	return {
		id: movie.id,
		title: movie.title,
		overview: movie.overview,
		release_date: movie.release_date,
		runtime: movie.runtime,
		vote_average: movie.vote_average,
		popularity: movie.popularity,
		budget: movie.budget,
		revenue: movie.revenue,
		status: movie.status,
		tagline: movie.tagline,
		genres: movie.genres.map((g) => g.name),
		production_companies: movie.production_companies.map((c) => c.name),
		imdb_id: movie.imdb_id,
	};
};

/**
 * Transform detailed TV show information to a minimal subset for AI context.
 * Includes additional details like seasons, episodes, networks, etc.
 */
export const toPartialTVShowDetails = (show: TMDBTVShowDetails) => {
	return {
		id: show.id,
		name: show.name,
		overview: show.overview,
		first_air_date: show.first_air_date,
		last_air_date: show.last_air_date,
		vote_average: show.vote_average,
		popularity: show.popularity,
		status: show.status,
		tagline: show.tagline,
		number_of_seasons: show.number_of_seasons,
		number_of_episodes: show.number_of_episodes,
		episode_run_time: show.episode_run_time,
		genres: show.genres.map((g) => g.name),
		networks: show.networks.map((n) => n.name),
		created_by: show.created_by.map((c) => c.name),
		in_production: show.in_production,
		seasons: show.seasons.map((s) => ({
			season_number: s.season_number,
			episode_count: s.episode_count,
			name: s.name,
			air_date: s.air_date,
		})),
	};
};
