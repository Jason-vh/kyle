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

export type { AuthStatus };

/**
 * Who is signed in. Never called directly by a view — `useSession()` owns the
 * caching, so there is one answer and one place that invalidates it.
 *
 * A network failure reads as signed out rather than throwing, so a flaky
 * connection sends you to the login page instead of a broken app.
 */
export async function fetchAuthStatus(): Promise<AuthStatus> {
  try {
    const res = await fetch("/api/auth/status");
    return (await res.json()) as AuthStatus;
  } catch {
    return { authenticated: false };
  }
}

export async function logout(): Promise<void> {
  await fetch("/api/auth/logout", { method: "POST" });
}
