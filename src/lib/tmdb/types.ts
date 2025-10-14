/**
 * TMDB API Type Definitions
 * Based on TMDB API v3 documentation: https://developer.themoviedb.org/reference/
 */

export interface TMDBMovie {
	id: number;
	title: string;
	original_title: string;
	original_language: string;
	overview: string;
	poster_path: string | null;
	backdrop_path: string | null;
	release_date: string;
	popularity: number;
	vote_average: number;
	vote_count: number;
	adult: boolean;
	video: boolean;
	genre_ids: number[];
}

export interface TMDBTVShow {
	id: number;
	name: string;
	original_name: string;
	original_language: string;
	overview: string;
	poster_path: string | null;
	backdrop_path: string | null;
	first_air_date: string;
	popularity: number;
	vote_average: number;
	vote_count: number;
	adult: boolean;
	genre_ids: number[];
	origin_country: string[];
}

export interface TMDBPerson {
	id: number;
	name: string;
	original_name: string;
	popularity: number;
	profile_path: string | null;
	adult: boolean;
	known_for_department: string;
	known_for: (TMDBMovie | TMDBTVShow)[];
}

export type TMDBMultiResult = (TMDBMovie | TMDBTVShow | TMDBPerson) & {
	media_type: "movie" | "tv" | "person";
};

export interface TMDBSearchResponse<T> {
	page: number;
	results: T[];
	total_pages: number;
	total_results: number;
}

export interface TMDBSearchOptions {
	language?: string;
	page?: number;
	include_adult?: boolean;
	region?: string;
	year?: number;
	primary_release_year?: number;
}

// Detailed types for specific endpoints

export interface TMDBGenre {
	id: number;
	name: string;
}

export interface TMDBProductionCompany {
	id: number;
	name: string;
	logo_path: string | null;
	origin_country: string;
}

export interface TMDBProductionCountry {
	iso_3166_1: string;
	name: string;
}

export interface TMDBSpokenLanguage {
	english_name: string;
	iso_639_1: string;
	name: string;
}

export interface TMDBMovieDetails extends Omit<TMDBMovie, "genre_ids"> {
	budget: number;
	revenue: number;
	runtime: number;
	status: string;
	tagline: string;
	genres: TMDBGenre[];
	production_companies: TMDBProductionCompany[];
	production_countries: TMDBProductionCountry[];
	spoken_languages: TMDBSpokenLanguage[];
	imdb_id: string | null;
	homepage: string | null;
}

export interface TMDBTVSeason {
	air_date: string | null;
	episode_count: number;
	id: number;
	name: string;
	overview: string;
	poster_path: string | null;
	season_number: number;
	vote_average: number;
}

export interface TMDBNetwork {
	id: number;
	name: string;
	logo_path: string | null;
	origin_country: string;
}

export interface TMDBCreatedBy {
	id: number;
	credit_id: string;
	name: string;
	gender: number;
	profile_path: string | null;
}

export interface TMDBTVShowDetails extends Omit<TMDBTVShow, "genre_ids"> {
	created_by: TMDBCreatedBy[];
	episode_run_time: number[];
	genres: TMDBGenre[];
	homepage: string;
	in_production: boolean;
	languages: string[];
	last_air_date: string | null;
	last_episode_to_air: {
		id: number;
		name: string;
		overview: string;
		air_date: string;
		episode_number: number;
		season_number: number;
	} | null;
	networks: TMDBNetwork[];
	number_of_episodes: number;
	number_of_seasons: number;
	production_companies: TMDBProductionCompany[];
	production_countries: TMDBProductionCountry[];
	seasons: TMDBTVSeason[];
	spoken_languages: TMDBSpokenLanguage[];
	status: string;
	tagline: string;
	type: string;
}
