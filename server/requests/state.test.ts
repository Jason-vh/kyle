import { describe, expect, test } from "bun:test";
import { resolveState } from "./state.ts";

describe("resolveState", () => {
  test("something downloading reads as downloading, whatever is already on disk", () => {
    expect(resolveState({ status: "pending" }, true)).toBe("downloading");
    expect(resolveState({ status: "available" }, true)).toBe("downloading");
  });

  test("on disk and not downloading is available", () => {
    expect(resolveState({ status: "available" }, false)).toBe("available");
  });

  test("in the library with nothing on disk is still pending", () => {
    expect(resolveState({ status: "pending" }, false)).toBe("pending");
  });

  // The request outlives the title, so a removal has to read as something.
  test("a title no longer in the library is unavailable", () => {
    expect(resolveState(undefined, false)).toBe("unavailable");
  });
});
