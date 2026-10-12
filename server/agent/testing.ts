import { fauxProvider, type FauxProviderHandle } from "@earendil-works/pi-ai";
import { retryPolicy } from "#server/durable/harness.ts";
import { model, models } from "./model.ts";

/**
 * Answers this process's model requests from a script instead of Anthropic. The
 * stand-in takes the configured model's provider and id, so conversations keep
 * asking for the model they would in production.
 */
export function useFauxModel(): FauxProviderHandle {
  const faux = fauxProvider({
    provider: model.provider,
    models: [{ id: model.id, input: ["text", "image"] }],
  });
  models.setProvider(faux.provider);
  return faux;
}

/** Retries a failed model request at once instead of seconds later; returns the undo. */
export function useInstantRetries(): () => void {
  const saved = { ...retryPolicy };
  retryPolicy.baseDelayMs = 1;
  return () => Object.assign(retryPolicy, saved);
}
