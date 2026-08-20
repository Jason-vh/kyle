import type { PlexAccount } from "../plex/types.ts";
import { buildAuthAppUrl, createPin, getAccount, getPin } from "../plex/api.ts";
import { appOrigin } from "../config.ts";

/** Platform key used for Plex rows in `platform_identities`. */
export const PLEX_PLATFORM = "plex";

/** What the callback should do once the user has claimed their PIN. */
export type PlexAuthIntent = { type: "login" } | { type: "link"; userId: string };

interface PendingAuth {
  pinId: number;
  intent: PlexAuthIntent;
  expires: number;
}

const PENDING_TTL_MS = 10 * 60 * 1000;

// Pending flows keyed by the single-use `state` carried through the Plex redirect.
const pendingAuths = new Map<string, PendingAuth>();

setInterval(() => {
  const now = Date.now();
  for (const [state, pending] of pendingAuths) {
    if (pending.expires < now) pendingAuths.delete(state);
  }
}, 60_000);

/**
 * Create a PIN and return the Plex Auth App URL to send the browser to.
 * The user returns to the callback with the `state` that resumes this flow.
 */
export async function startPlexAuth(intent: PlexAuthIntent): Promise<string> {
  const pin = await createPin();
  const state = crypto.randomUUID();

  pendingAuths.set(state, { pinId: pin.id, intent, expires: Date.now() + PENDING_TTL_MS });

  const forwardUrl = `${appOrigin()}/api/auth/plex/callback?state=${state}`;
  return buildAuthAppUrl(pin.code, forwardUrl);
}

export type PlexAuthResult =
  | { status: "ok"; intent: PlexAuthIntent; account: PlexAccount }
  | { status: "expired" }
  | { status: "denied" };

/**
 * Resume a flow by its `state`: read the claimed PIN and the account behind it.
 * The Plex access token is only used here and never stored.
 */
export async function completePlexAuth(state: string): Promise<PlexAuthResult> {
  const pending = pendingAuths.get(state);
  pendingAuths.delete(state);
  if (!pending || pending.expires < Date.now()) return { status: "expired" };

  const pin = await getPin(pending.pinId);
  if (!pin.authToken) return { status: "denied" };

  return { status: "ok", intent: pending.intent, account: await getAccount(pin.authToken) };
}
