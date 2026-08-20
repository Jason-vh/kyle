export interface AuthUser {
  id: string;
  name: string;
  admin: boolean;
  /** Linked Plex account, or null when none is connected. */
  plexUsername?: string | null;
}

interface AuthStatus {
  authenticated: boolean;
  /** False when the server has no Plex client identifier configured. */
  plexEnabled?: boolean;
  user?: AuthUser;
}

let authCached: AuthStatus | null = null;

export function resetAuthCache(): void {
  authCached = null;
}

export async function checkAuth(): Promise<boolean> {
  const status = await getAuthStatus();
  return status.authenticated;
}

export async function getAuthStatus(): Promise<AuthStatus> {
  if (authCached !== null) return authCached;
  try {
    const res = await fetch("/api/auth/status");
    const data = (await res.json()) as AuthStatus;
    authCached = data;
    return authCached;
  } catch {
    return { authenticated: false };
  }
}

export function getCachedUser(): AuthUser | null {
  return authCached?.user ?? null;
}

export async function isPlexEnabled(): Promise<boolean> {
  return (await getAuthStatus()).plexEnabled ?? false;
}

export async function logout(): Promise<void> {
  await fetch("/api/auth/logout", { method: "POST" });
  authCached = null;
}
