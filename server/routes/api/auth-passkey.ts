import { eq } from "drizzle-orm";
import { db } from "../../db/index.ts";
import { userCredentials } from "../../db/schema.ts";
import { getUserById, getUserCredentials, getCredentialById } from "../../db/users.ts";
import {
  generateRegOptions,
  verifyRegResponse,
  generateAuthOptions,
  verifyAuthResponse,
  storeChallenge,
  getAndDeleteChallenge,
  type RegistrationResponseJSON,
  type AuthenticationResponseJSON,
  type StoredCredential,
} from "../../auth/webauthn.ts";
import { signJwt, buildJwtCookie, isLocalhost, parseAuthCookie } from "../../auth/jwt.ts";
import { createLogger } from "../../logger.ts";

const log = createLogger("api-passkey");

// ---------------------------------------------------------------------------
// POST /api/auth/passkey/login/options
// ---------------------------------------------------------------------------

export async function handlePasskeyLoginOptions(_req: Request): Promise<Response> {
  const options = await generateAuthOptions();
  storeChallenge("login", options.challenge);
  return Response.json(options);
}

// ---------------------------------------------------------------------------
// POST /api/auth/passkey/login/verify
// ---------------------------------------------------------------------------

export async function handlePasskeyLoginVerify(req: Request): Promise<Response> {
  let body: AuthenticationResponseJSON;
  try {
    body = (await req.json()) as AuthenticationResponseJSON;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const expectedChallenge = getAndDeleteChallenge("login");
  if (!expectedChallenge) {
    return Response.json({ error: "Challenge expired or not found" }, { status: 400 });
  }

  // Find the credential
  const cred = await getCredentialById(body.id);
  if (!cred) {
    return Response.json({ error: "Credential not found" }, { status: 400 });
  }

  const storedCred: StoredCredential = {
    credentialId: cred.credentialId,
    publicKey: cred.publicKey,
    counter: cred.counter,
    transports: cred.transports ?? undefined,
  };

  try {
    const verification = await verifyAuthResponse(body, expectedChallenge, storedCred);
    if (!verification.verified) {
      return Response.json({ error: "Verification failed" }, { status: 400 });
    }

    // Update counter
    await db
      .update(userCredentials)
      .set({
        counter: verification.authenticationInfo.newCounter,
        lastUsedAt: new Date(),
      })
      .where(eq(userCredentials.id, cred.id));

    // Get user
    const user = await getUserById(cred.userId);
    if (!user) {
      return Response.json({ error: "User not found" }, { status: 400 });
    }

    const token = await signJwt({ id: user.id, name: user.displayName, admin: user.isAdmin });

    log.info("passkey login successful", { userId: user.id, name: user.displayName });
    return Response.json(
      { verified: true, user: { id: user.id, name: user.displayName, admin: user.isAdmin } },
      { headers: { "Set-Cookie": buildJwtCookie(token, isLocalhost(req)) } },
    );
  } catch (error) {
    log.error("passkey login verification failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return Response.json({ error: "Verification failed" }, { status: 400 });
  }
}

// ---------------------------------------------------------------------------
// POST /api/auth/passkey/register/options (add passkey to existing user)
// ---------------------------------------------------------------------------

export async function handlePasskeyRegisterOptions(req: Request): Promise<Response> {
  const user = await parseAuthCookie(req);
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const existing = await getUserCredentials(user.id);
  const excludeCredentials: StoredCredential[] = existing.map((c) => ({
    credentialId: c.credentialId,
    publicKey: c.publicKey,
    counter: c.counter,
    transports: c.transports ?? undefined,
  }));

  const options = await generateRegOptions(user.id, user.name, excludeCredentials);
  storeChallenge(`reg:${user.id}`, options.challenge);
  return Response.json(options);
}

// ---------------------------------------------------------------------------
// POST /api/auth/passkey/register/verify (add passkey to existing user)
// ---------------------------------------------------------------------------

export async function handlePasskeyRegisterVerify(req: Request): Promise<Response> {
  const user = await parseAuthCookie(req);
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: RegistrationResponseJSON;
  try {
    body = (await req.json()) as RegistrationResponseJSON;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const expectedChallenge = getAndDeleteChallenge(`reg:${user.id}`);
  if (!expectedChallenge) {
    return Response.json({ error: "Challenge expired or not found" }, { status: 400 });
  }

  try {
    const verification = await verifyRegResponse(body, expectedChallenge);
    if (!verification.verified || !verification.registrationInfo) {
      return Response.json({ error: "Verification failed" }, { status: 400 });
    }

    const { credential, credentialDeviceType, credentialBackedUp } = verification.registrationInfo;

    await db.insert(userCredentials).values({
      userId: user.id,
      credentialId: credential.id,
      publicKey: credential.publicKey,
      counter: credential.counter,
      deviceType: credentialDeviceType,
      backedUp: credentialBackedUp,
      transports: credential.transports,
    });

    log.info("passkey registered for existing user", { userId: user.id });
    return Response.json({ verified: true });
  } catch (error) {
    log.error("passkey registration failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return Response.json({ error: "Verification failed" }, { status: 400 });
  }
}
