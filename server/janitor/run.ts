import { errorMessage } from "#server/errors.ts";
import { createLogger } from "#server/logger.ts";
import { applyAction } from "./apply.ts";
import { gatherSweepState } from "./gather.ts";
import { DEFAULT_LIMITS, planSweep, type JanitorAction, type SweepLimits } from "./plan.ts";

const log = createLogger("janitor");

export interface SweepReport {
  actions: JanitorAction[];
  applied: number;
  failed: number;
  deletedBytes: number;
}

/**
 * One pass: read everything, decide, and — when applying — do it. A failed
 * action is logged and the sweep carries on; the next run tries again. Without
 * apply this is the dry run: everything decided, nothing touched, which is
 * what the script runs and what says what tonight's sweep would do.
 */
export async function sweep(
  apply: boolean,
  limits: SweepLimits = DEFAULT_LIMITS,
): Promise<SweepReport> {
  const state = await gatherSweepState();
  const actions = planSweep(state, limits);

  for (const action of actions) {
    log.info("janitor decision", {
      kind: action.kind,
      subject: action.subject,
      reason: action.reason,
    });
  }

  let applied = 0;
  let failed = 0;
  let deletedBytes = 0;

  if (apply) {
    for (const action of actions) {
      try {
        await applyAction(action);
        applied++;
        if (action.kind === "delete-torrent") deletedBytes += action.bytes;
      } catch (error) {
        failed++;
        log.error("janitor action failed", {
          kind: action.kind,
          subject: action.subject,
          error: errorMessage(error),
        });
      }
    }
  }

  log.info("sweep finished", { apply, decided: actions.length, applied, failed, deletedBytes });
  return { actions, applied, failed, deletedBytes };
}
