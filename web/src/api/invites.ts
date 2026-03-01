import { startRegistration } from "@simplewebauthn/browser";
import type { AuthUser } from "./auth";

export async function validateInvite(code: string): Promise<{ displayName: string }> {
  const res = await fetch(`/api/invites/${code}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? "Invalid invite");
  }
  return res.json() as Promise<{ displayName: string }>;
}

export async function redeemInvite(code: string): Promise<AuthUser> {
  // Get registration options
  const optionsRes = await fetch(`/api/invites/${code}/register/options`, { method: "POST" });
  if (!optionsRes.ok) {
    const body = await optionsRes.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? "Failed to get registration options");
  }
  const options = await optionsRes.json();

  // Create passkey
  const credential = await startRegistration({ optionsJSON: options });

  // Verify with server
  const verifyRes = await fetch(`/api/invites/${code}/register/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(credential),
  });

  if (!verifyRes.ok) {
    const body = await verifyRes.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? "Registration failed");
  }

  const result = (await verifyRes.json()) as { verified: boolean; user: AuthUser };
  return result.user;
}
