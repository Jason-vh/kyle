import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import type { Models } from "@earendil-works/pi-ai";
import { createRegistry, Harness, type Storage } from "@earendil-works/pi-durable";
import { db } from "#server/db/index.ts";
import { errorFields } from "#server/errors.ts";
import { createLogger } from "#server/logger.ts";
import { models } from "#server/agent/model.ts";
import { KyleExtension } from "#server/agent/extension.ts";
import { PostgresStorage } from "./postgres-storage.ts";

const log = createLogger("durable");

/**
 * Generation retries, as Kyle's own loop did them: two more tries, five seconds
 * apart and growing. Read at every use, so tests can shorten the wait.
 */
export const retryPolicy = { maxRetries: 2, baseDelayMs: 5_000 };

/** A Harness running Kyle over `storage`; the process normally has one, from `getHarness()`. */
export async function openHarness(
  storage: Storage,
  harnessModels: Models = models,
): Promise<Harness> {
  const registry = createRegistry();
  registry.install(KyleExtension);
  return Harness.open(
    storage,
    {
      models: harnessModels,
      registry,
      settings: {
        get retry() {
          return retryPolicy;
        },
      },
      onReport: (error) => log.error("durable extension failed", errorFields(error)),
    },
    BACKGROUND_CONTEXT,
  );
}

let opening: Promise<Harness> | undefined;

/** The process's one Harness; it owns the `durable` schema while the process runs. */
export function getHarness(): Promise<Harness> {
  opening ??= PostgresStorage.open(db).then((storage) => openHarness(storage));
  return opening;
}

/** Opens the Harness at startup and continues any run the last process left unfinished. */
export async function startHarness(): Promise<Harness> {
  const harness = await getHarness();
  harness.resume();
  log.info("durable harness open");
  return harness;
}
