export interface AuthUser {
  id: string;
  name: string;
  admin: boolean;
}

interface AuthStatus {
  authenticated: boolean;
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

export async function logout(): Promise<void> {
  await fetch("/api/auth/logout", { method: "POST" });
  authCached = null;
}
