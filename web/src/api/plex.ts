import { apiFetch } from "./client";

export type PlexMemberStatus = "owner" | "member" | "pending";

export interface PlexMember {
  id: string;
  name: string;
  thumb: string;
  status: PlexMemberStatus;
  /** Withheld unless the viewer invited them, or is an admin. */
  email?: string;
  invitedBy?: string;
  canRemove: boolean;
}

export async function getPlexMembers(): Promise<PlexMember[]> {
  const { members } = await apiFetch<{ members: PlexMember[] }>("/api/plex/members");
  return members;
}

export async function invitePlexMember(email: string): Promise<void> {
  await apiFetch("/api/plex/invites", { method: "POST", body: JSON.stringify({ email }) });
}

export async function removePlexMember(id: string): Promise<void> {
  await apiFetch(`/api/plex/members/${encodeURIComponent(id)}`, { method: "DELETE" });
}

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
  plex_no_access: "That Plex account does not have access to the Plex server.",
  plex_taken: "That Plex account is already linked to another user.",
  plex_exists: "Disconnect your current Plex account first.",
};

/** Maps an `?error=` code from the Plex callback redirect to a message. */
export function plexErrorMessage(code: unknown): string {
  if (typeof code !== "string") return "";
  return PLEX_ERRORS[code] ?? "Plex sign-in failed.";
}
