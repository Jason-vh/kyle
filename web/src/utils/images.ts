/** TMDB artwork, sized by a width bucket in the path. */
const TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p";

const POSTER_WIDTHS = [92, 154, 185, 342] as const;

export type PosterWidth = (typeof POSTER_WIDTHS)[number];

export function posterUrl(posterPath: string, width: PosterWidth = 342): string {
  return `${TMDB_IMAGE_BASE}/w${width}${posterPath}`;
}

export function posterSrcset(posterPath: string): string {
  return POSTER_WIDTHS.map((width) => `${posterUrl(posterPath, width)} ${width}w`).join(", ");
}

export function backdropUrl(backdropPath: string | null): string | null {
  return backdropPath ? `${TMDB_IMAGE_BASE}/w780${backdropPath}` : null;
}
