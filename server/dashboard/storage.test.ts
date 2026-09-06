import { describe, expect, test } from "bun:test";
import { mountFor } from "./storage.ts";

const MOUNTS = [
  { path: "/", freeSpace: 400_000, totalSpace: 890_000 },
  { path: "/home/jason", freeSpace: 1_600_000, totalSpace: 15_900_000 },
];

describe("mountFor", () => {
  // The media disk and the root filesystem are both prefixes of the path;
  // reporting the root would show the wrong disk entirely.
  test("prefers the longest matching mount", () => {
    expect(mountFor("/home/jason/media/Movies", MOUNTS)?.path).toBe("/home/jason");
  });

  test("falls back to the root when nothing else matches", () => {
    expect(mountFor("/srv/media", MOUNTS)?.path).toBe("/");
  });

  test("matches a path that is the mount itself", () => {
    expect(mountFor("/home/jason", MOUNTS)?.path).toBe("/home/jason");
  });

  // `/home/jasonvh` is not inside `/home/jason`, however much it looks like it.
  test("does not match a mount that is only a string prefix", () => {
    expect(mountFor("/home/jasonvh/media", MOUNTS)?.path).toBe("/");
  });

  test("reports nothing when there are no mounts", () => {
    expect(mountFor("/media", [])).toBeUndefined();
  });
});
