import { eq } from "drizzle-orm";
import { isObject, isText, readJsonObject } from "#server/http/input.ts";
import { db } from "#server/db/index.ts";
import { userCredentials } from "#server/db/schema.ts";
import { getUserCredentials, getCredentialById } from "#server/db/users.ts";
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
} from "#server/auth/webauthn.ts";
import { signJwt, buildJwtCookie, isLocalhost } from "#server/auth/jwt.ts";
import { requireAuth } from "#server/auth/middleware.ts";
import { createLogger } from "#server/logger.ts";
import { errorMessage } from "#server/errors.ts";
import { createFlowCookie, readFlowCookie } from "#server/auth/flow-cookie.ts";
import { getActiveUser } from "#server/auth/account.ts";

const log = createLogger("api-passkey");

function validCredential(body: AuthenticationResponseJSON | RegistrationResponseJSON): boolean {
  return (
    isText(body.id, 2048) &&
    isText(body.rawId, 2048) &&
    body.type === "public-key" &&
    isObject(body.response) &&
    isText(body.response.clientDataJSON)
  );
}

// ---------------------------------------------------------------------------
// POST /api/auth/passkey/login/options
// ---------------------------------------------------------------------------

export async function handlePasskeyLoginOptions(req: Request): Promise<Response> {
  const options = await generateAuthOptions();
  const { binding, cookie } = createFlowCookie(req, "kyle_passkey_login", 300);
  storeChallenge(`login:${binding}`, options.challenge);
  return Response.json(options, { headers: { "Set-Cookie": cookie } });
}

// ---------------------------------------------------------------------------
// POST /api/auth/passkey/login/verify
// ---------------------------------------------------------------------------

export async function handlePasskeyLoginVerify(req: Request): Promise<Response> {
  let body: AuthenticationResponseJSON;
  try {
    body = (await readJsonObject(req)) as unknown as AuthenticationResponseJSON;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!validCredential(body)) {
    return Response.json({ error: "Invalid credential" }, { status: 400 });
  }

  const binding = readFlowCookie(req, "kyle_passkey_login");
  const expectedChallenge = binding ? getAndDeleteChallenge(`login:${binding}`) : null;
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
    const user = await getActiveUser(cred.userId);
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
      error: errorMessage(error),
    });
    return Response.json({ error: "Verification failed" }, { status: 400 });
  }
}

// ---------------------------------------------------------------------------
// POST /api/auth/passkey/register/options (add passkey to existing user)
// ---------------------------------------------------------------------------

export async function handlePasskeyRegisterOptions(req: Request): Promise<Response> {
  const auth = await requireAuth(req);
  if ("error" in auth) return auth.error;
  const { user } = auth;

  const existing = await getUserCredentials(user.id);
  const excludeCredentials: StoredCredential[] = existing.map((c) => ({
    credentialId: c.credentialId,
    publicKey: c.publicKey,
    counter: c.counter,
    transports: c.transports ?? undefined,
  }));

  const options = await generateRegOptions(user.id, user.name, excludeCredentials);
  const { binding, cookie } = createFlowCookie(req, "kyle_passkey_register", 300);
  storeChallenge(`reg:${user.id}:${binding}`, options.challenge);
  return Response.json(options, { headers: { "Set-Cookie": cookie } });
}

// ---------------------------------------------------------------------------
// POST /api/auth/passkey/register/verify (add passkey to existing user)
// ---------------------------------------------------------------------------

export async function handlePasskeyRegisterVerify(req: Request): Promise<Response> {
  const auth = await requireAuth(req);
  if ("error" in auth) return auth.error;
  const { user } = auth;

  let body: RegistrationResponseJSON;
  try {
    body = (await readJsonObject(req)) as unknown as RegistrationResponseJSON;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!validCredential(body)) {
    return Response.json({ error: "Invalid credential" }, { status: 400 });
  }

  const binding = readFlowCookie(req, "kyle_passkey_register");
  const expectedChallenge = binding ? getAndDeleteChallenge(`reg:${user.id}:${binding}`) : null;
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
      error: errorMessage(error),
    });
    return Response.json({ error: "Verification failed" }, { status: 400 });
  }
}
