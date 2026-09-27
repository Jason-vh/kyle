import { describe, expect, test } from "vitest";
import { readPreview } from "./title-preview";

const preview = {
  mediaType: "movie",
  tmdbId: 27205,
  title: "Inception",
  year: 2010,
  posterPath: "/inception.jpg",
};

describe("readPreview", () => {
  test("reads the title the link carried", () => {
    expect(readPreview({ back: "/library", preview }, "movie", 27205)).toEqual(preview);
  });

  test("ignores a preview of some other title", () => {
    expect(readPreview({ preview }, "movie", 1)).toBeUndefined();
    expect(readPreview({ preview }, "series", 27205)).toBeUndefined();
  });

  test("ignores state that carries no usable preview", () => {
    expect(readPreview(null, "movie", 27205)).toBeUndefined();
    expect(readPreview({ back: "/library" }, "movie", 27205)).toBeUndefined();
    expect(readPreview({ preview: { ...preview, title: 7 } }, "movie", 27205)).toBeUndefined();
  });

  test("drops fields of the wrong shape rather than the whole preview", () => {
    const loose = { ...preview, year: "2010", posterPath: null };
    expect(readPreview({ preview: loose }, "movie", 27205)).toEqual({
      mediaType: "movie",
      tmdbId: 27205,
      title: "Inception",
    });
  });
});
