import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import { createRegistry, Harness } from "@earendil-works/pi-durable";
import { db } from "#server/db/index.ts";
import { errorFields } from "#server/errors.ts";
import { createLogger } from "#server/logger.ts";
import { models } from "#server/agent/model.ts";
import { KyleExtension } from "#server/agent/extension.ts";
import { PostgresStorage } from "./postgres-storage.ts";

const log = createLogger("durable");

/** Generation retries, as Kyle's own loop did them: two more tries, five seconds apart and growing. */
export const RETRY_POLICY = { maxRetries: 2, baseDelayMs: 5_000 };

let opening: Promise<Harness> | undefined;

/** The process's one Harness; it owns the `durable` schema while the process runs. */
export function getHarness(): Promise<Harness> {
  opening ??= openHarness();
  return opening;
}

async function openHarness(): Promise<Harness> {
  const registry = createRegistry();
  registry.install(KyleExtension);
  const harness = await Harness.open(
    await PostgresStorage.open(db),
    {
      models,
      registry,
      settings: { retry: RETRY_POLICY },
      onReport: (error) => log.error("durable extension failed", errorFields(error)),
    },
    BACKGROUND_CONTEXT,
  );
  log.info("durable harness open");
  return harness;
}

/** Opens the Harness at startup and continues any run the last process left unfinished. */
export async function startHarness(): Promise<void> {
  const harness = await getHarness();
  harness.resume();
}
