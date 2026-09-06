/** TMDB artwork, sized by a width bucket in the path. */
const TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p";

export function posterUrl(posterPath: string | null): string | null {
  return posterPath ? `${TMDB_IMAGE_BASE}/w342${posterPath}` : null;
}

export function backdropUrl(backdropPath: string | null): string | null {
  return backdropPath ? `${TMDB_IMAGE_BASE}/w780${backdropPath}` : null;
}
