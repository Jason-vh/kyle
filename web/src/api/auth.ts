let authCached: boolean | null = null;

export function resetAuthCache(): void {
  authCached = null;
}

export async function checkAuth(): Promise<boolean> {
  if (authCached !== null) return authCached;
  try {
    const res = await fetch("/api/auth/status");
    const data = (await res.json()) as { authenticated: boolean };
    authCached = data.authenticated;
    return authCached;
  } catch {
    return false;
  }
}

export async function login(token: string): Promise<boolean> {
  const res = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token }),
  });
  if (res.ok) authCached = true;
  return res.ok;
}
