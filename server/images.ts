import type { ImageContent } from "@mariozechner/pi-ai";
import { createLogger } from "./logger.ts";
import { errorMessage } from "./errors.ts";

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
    images.map(async (image): Promise<ImageContent> => {
      const response = await fetch(image.url, { headers: image.headers });
      if (!response.ok) {
        throw new Error(`Failed to download ${image.name}: ${response.status}`);
      }

      const mimeType = (response.headers.get("content-type") ?? "").split(";")[0]!.trim();
      if (!mimeType.startsWith("image/")) {
        throw new Error(
          `Expected an image for ${image.name}, got ${mimeType || "no content type"}`,
        );
      }

      const data = Buffer.from(await response.arrayBuffer()).toString("base64");
      return { type: "image", data, mimeType };
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
