import { createModels } from "@earendil-works/pi-ai";
import { anthropicProvider } from "@earendil-works/pi-ai/providers/anthropic";
import { createLogger } from "#server/logger.ts";

const log = createLogger("agent:model");

const DEFAULT_MODEL = "claude-sonnet-4-5";

export const models = createModels();
models.setProvider(anthropicProvider());

/** Resolves ANTHROPIC_MODEL against the known Anthropic catalog, falling back to the default. */
function resolveModel() {
  const configured = process.env.ANTHROPIC_MODEL;
  if (configured) {
    const match = models.getModel("anthropic", configured);
    if (match) return match;
    log.warn("unknown ANTHROPIC_MODEL, using default", { configured, default: DEFAULT_MODEL });
  }
  return models.getModel("anthropic", DEFAULT_MODEL)!;
}

export const model = resolveModel();

log.info("agent model selected", { model: model.id });
