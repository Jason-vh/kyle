import type { AdminUser, UserFootprint } from "#shared/types";

const PLATFORMS: Record<string, string> = { plex: "Plex", slack: "Slack", discord: "Discord" };

export function platformName(platform: string): string {
  return PLATFORMS[platform] ?? platform;
}

function counted(total: number, noun: string): string | undefined {
  if (total === 0) return undefined;
  return `${total} ${noun}${total === 1 ? "" : "s"}`;
}

/** "Plex · Slack · 1 passkey", or how they sign in, at a glance. */
export function signInSummary(user: AdminUser): string {
  const parts = [
    ...user.identities.map((identity) => platformName(identity.platform)),
    counted(user.footprint.passkeys, "passkey"),
  ];
  return parts.filter(Boolean).join(" · ") || "No way to sign in";
}

/** "11 requests · 5 conversations", or what they would take with them. */
export function historySummary(footprint: UserFootprint): string {
  const parts = [
    counted(footprint.requests, "request"),
    counted(footprint.conversations, "conversation"),
    counted(footprint.movieSubscriptions + footprint.seriesSubscriptions, "subscription"),
    counted(footprint.notifications, "notification"),
  ];
  return parts.filter(Boolean).join(" · ") || "No history";
}

export function hasHistory(footprint: UserFootprint): boolean {
  const { identities, passkeys, plexAccounts, ...history } = footprint;
  return Object.values(history).some((total) => total > 0);
}
