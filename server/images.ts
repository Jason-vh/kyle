import type { ImageContent } from "@mariozechner/pi-ai";
import { createLogger } from "./logger.ts";
import { errorMessage } from "./errors.ts";
import { createConcurrencyLimit } from "./http/concurrency.ts";

const log = createLogger("images");

/** Image formats every interface accepts and the model can read. */
export const SUPPORTED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
]);

/** Beyond this an image costs more than it tells us. */
export const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
export const MAX_IMAGES = 10;
const DOWNLOAD_TIMEOUT_MS = 15_000;
const download = createConcurrencyLimit(3, 24);

export interface RemoteImage {
  name: string;
  url: string;
  /** Authorization and friends, for hosts that do not serve images publicly. */
  headers?: Record<string, string>;
}

/**
 * Downloads images for the model, dropping any that fail rather than losing the
 * whole message. A non-image response usually means a missing read scope, so the
 * content type is verified rather than trusted from the platform's metadata.
 */
export async function downloadImages(
  source: string,
  images: RemoteImage[],
): Promise<ImageContent[]> {
  const results = await Promise.allSettled(
    images.slice(0, MAX_IMAGES).map((image): Promise<ImageContent> => {
      const signal = AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS);
      return download(async () => {
        const response = await fetch(image.url, { headers: image.headers, signal });
        try {
          if (!response.ok) throw new Error(`Failed to download ${image.name}: ${response.status}`);
          const mimeType = (response.headers.get("content-type") ?? "")
            .split(";")[0]!
            .trim()
            .toLowerCase();
          if (!SUPPORTED_IMAGE_TYPES.has(mimeType))
            throw new Error(`Unsupported image type: ${mimeType}`);
          if (Number(response.headers.get("content-length")) > MAX_IMAGE_SIZE)
            throw new Error("Image is too large");
          const data = await readImage(response, signal);
          return { type: "image", data, mimeType };
        } finally {
          await response.body?.cancel().catch(() => {});
        }
      }, signal);
    }),
  );

  const downloaded: ImageContent[] = [];
  for (const result of results) {
    if (result.status === "fulfilled") {
      downloaded.push(result.value);
    } else {
      log.warn("failed to download image", { source, error: errorMessage(result.reason) });
    }
  }
  return downloaded;
}

async function readImage(response: Response, signal: AbortSignal): Promise<string> {
  if (!response.body) throw new Error("Empty image");
  const reader = response.body.getReader();
  const abort = () => {
    void reader.cancel(signal.reason).catch(() => {});
  };
  signal.addEventListener("abort", abort, { once: true });
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      signal.throwIfAborted();
      const { done, value } = await reader.read();
      signal.throwIfAborted();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_IMAGE_SIZE) throw new Error("Image is too large");
      chunks.push(value);
    }
    if (size === 0) throw new Error("Empty image");
    return Buffer.concat(chunks, size).toString("base64");
  } finally {
    signal.removeEventListener("abort", abort);
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
