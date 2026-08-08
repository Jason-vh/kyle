import { getModel, getModels } from "@mariozechner/pi-ai";
import { createLogger } from "../logger.ts";

const log = createLogger("agent:model");

const DEFAULT_MODEL = "claude-sonnet-4-5";

/** Resolves ANTHROPIC_MODEL against the known Anthropic catalog, falling back to the default. */
function resolveModel() {
  const configured = process.env.ANTHROPIC_MODEL;
  if (configured) {
    const match = getModels("anthropic").find((m) => m.id === configured);
    if (match) return match;
    log.warn("unknown ANTHROPIC_MODEL, using default", { configured, default: DEFAULT_MODEL });
  }
  return getModel("anthropic", DEFAULT_MODEL);
}

export const model = resolveModel();

log.info("agent model selected", { model: model.id });
