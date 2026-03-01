import { startRegistration, startAuthentication } from "@simplewebauthn/browser";
import type { AuthUser } from "./auth";

export async function passkeyLogin(): Promise<AuthUser> {
  // Get authentication options
  const optionsRes = await fetch("/api/auth/passkey/login/options", { method: "POST" });
  if (!optionsRes.ok) throw new Error("Failed to get login options");
  const options = await optionsRes.json();

  // Prompt user for passkey
  const credential = await startAuthentication({ optionsJSON: options });

  // Verify with server
  const verifyRes = await fetch("/api/auth/passkey/login/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(credential),
  });

  if (!verifyRes.ok) {
    const body = await verifyRes.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? "Login failed");
  }

  const result = (await verifyRes.json()) as { verified: boolean; user: AuthUser };
  return result.user;
}

export async function passkeyRegisterExisting(): Promise<void> {
  const optionsRes = await fetch("/api/auth/passkey/register/options", { method: "POST" });
  if (!optionsRes.ok) throw new Error("Failed to get registration options");
  const options = await optionsRes.json();

  const credential = await startRegistration({ optionsJSON: options });

  const verifyRes = await fetch("/api/auth/passkey/register/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(credential),
  });

  if (!verifyRes.ok) {
    const body = await verifyRes.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? "Registration failed");
  }
}
