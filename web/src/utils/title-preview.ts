import type { LibraryMediaType } from "#shared/types";

export interface TitlePreview {
  mediaType: LibraryMediaType;
  tmdbId: number;
  title: string;
  year?: number;
  posterPath?: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function readPreview(
  state: unknown,
  mediaType: LibraryMediaType,
  tmdbId: number,
): TitlePreview | undefined {
  const preview = isRecord(state) ? state.preview : undefined;
  if (!isRecord(preview)) return undefined;
  if (preview.mediaType !== mediaType || preview.tmdbId !== tmdbId) return undefined;
  if (typeof preview.title !== "string") return undefined;

  return {
    mediaType,
    tmdbId,
    title: preview.title,
    year: typeof preview.year === "number" ? preview.year : undefined,
    posterPath: typeof preview.posterPath === "string" ? preview.posterPath : undefined,
  };
}
