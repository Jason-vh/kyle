import type { BraveWebResult } from "./types.ts";

export function toPartialWebResult(result: BraveWebResult) {
  return {
    title: result.title,
    url: result.url,
    description: result.description,
  };
}
