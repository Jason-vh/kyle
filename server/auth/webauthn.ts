import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
  type VerifiedRegistrationResponse,
  type VerifiedAuthenticationResponse,
  type RegistrationResponseJSON,
  type AuthenticationResponseJSON,
  type AuthenticatorTransportFuture,
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
} from "@simplewebauthn/server";

// Challenge store with 5-minute TTL
const challengeStore = new Map<string, { challenge: string; expires: number }>();
const CHALLENGE_TTL_MS = 5 * 60 * 1000;

function getConfig() {
  const isDev = !process.env.RAILWAY_ENVIRONMENT && !process.env.WEBAUTHN_RP_ID?.includes(".");

  return {
    rpName: "Kyle",
    rpID: process.env.WEBAUTHN_RP_ID ?? (isDev ? "localhost" : "kyle.vhtm.eu"),
    origin:
      process.env.WEBAUTHN_ORIGIN ?? (isDev ? "http://localhost:5173" : "https://kyle.vhtm.eu"),
  };
}

export function storeChallenge(key: string, challenge: string): void {
  challengeStore.set(key, { challenge, expires: Date.now() + CHALLENGE_TTL_MS });
}

export function getAndDeleteChallenge(key: string): string | null {
  const entry = challengeStore.get(key);
  if (!entry) return null;
  challengeStore.delete(key);
  if (entry.expires < Date.now()) return null;
  return entry.challenge;
}

// Periodic cleanup
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of challengeStore) {
    if (entry.expires < now) challengeStore.delete(key);
  }
}, 60_000);

export interface StoredCredential {
  credentialId: string;
  publicKey: Uint8Array;
  counter: number;
  transports?: string[];
}

export async function generateRegOptions(
  userId: string,
  userName: string,
  existingCredentials: StoredCredential[] = [],
): Promise<PublicKeyCredentialCreationOptionsJSON> {
  const config = getConfig();
  const options = await generateRegistrationOptions({
    rpName: config.rpName,
    rpID: config.rpID,
    userName,
    userID: new TextEncoder().encode(userId),
    attestationType: "none",
    excludeCredentials: existingCredentials.map((c) => ({
      id: c.credentialId,
      transports: c.transports as AuthenticatorTransportFuture[] | undefined,
    })),
    authenticatorSelection: {
      residentKey: "preferred",
      userVerification: "preferred",
    },
  });

  return options;
}

export async function verifyRegResponse(
  response: RegistrationResponseJSON,
  expectedChallenge: string,
): Promise<VerifiedRegistrationResponse> {
  const config = getConfig();
  return verifyRegistrationResponse({
    response,
    expectedChallenge,
    expectedOrigin: config.origin,
    expectedRPID: config.rpID,
  });
}

export async function generateAuthOptions(
  allowCredentials?: StoredCredential[],
): Promise<PublicKeyCredentialRequestOptionsJSON> {
  const config = getConfig();
  return generateAuthenticationOptions({
    rpID: config.rpID,
    allowCredentials: allowCredentials?.map((c) => ({
      id: c.credentialId,
      transports: c.transports as AuthenticatorTransportFuture[] | undefined,
    })),
    userVerification: "preferred",
  });
}

export async function verifyAuthResponse(
  response: AuthenticationResponseJSON,
  expectedChallenge: string,
  credential: StoredCredential,
): Promise<VerifiedAuthenticationResponse> {
  const config = getConfig();
  return verifyAuthenticationResponse({
    response,
    expectedChallenge,
    expectedOrigin: config.origin,
    expectedRPID: config.rpID,
    credential: {
      id: credential.credentialId,
      publicKey: new Uint8Array(credential.publicKey) as Uint8Array<ArrayBuffer>,
      counter: credential.counter,
      transports: credential.transports as AuthenticatorTransportFuture[] | undefined,
    },
  });
}

export type { RegistrationResponseJSON, AuthenticationResponseJSON };
