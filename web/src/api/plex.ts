import { apiFetch } from "./client";

/** Hands the browser to the Plex Auth App; it returns via /api/auth/plex/callback. */
async function startPlexFlow(endpoint: string): Promise<void> {
  const { authUrl } = await apiFetch<{ authUrl: string }>(endpoint, { method: "POST" });
  window.location.assign(authUrl);
}

export async function startPlexLogin(): Promise<void> {
  return startPlexFlow("/api/auth/plex/login/start");
}

export async function startPlexLink(): Promise<void> {
  return startPlexFlow("/api/auth/plex/link/start");
}

export async function unlinkPlex(): Promise<void> {
  await apiFetch("/api/auth/plex/link", { method: "DELETE" });
}

const PLEX_ERRORS: Record<string, string> = {
  plex_expired: "That Plex sign-in link expired. Please try again.",
  plex_denied: "Plex sign-in was not completed.",
  plex_failed: "Could not reach Plex. Please try again.",
  plex_unlinked: "That Plex account is not linked to a Kyle user.",
  plex_taken: "That Plex account is already linked to another user.",
  plex_exists: "Disconnect your current Plex account first.",
};

/** Maps an `?error=` code from the Plex callback redirect to a message. */
export function plexErrorMessage(code: unknown): string {
  if (typeof code !== "string") return "";
  return PLEX_ERRORS[code] ?? "Plex sign-in failed.";
}
