export async function checkAuth(): Promise<boolean> {
  try {
    const res = await fetch("/api/auth/status");
    const data = (await res.json()) as { authenticated: boolean };
    return data.authenticated;
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
  return res.ok;
}
