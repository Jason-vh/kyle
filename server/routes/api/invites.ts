import { eq } from "drizzle-orm";
import { db } from "../../db/index.ts";
import { users, userCredentials, userInvites } from "../../db/schema.ts";
import {
  generateRegOptions,
  verifyRegResponse,
  storeChallenge,
  getAndDeleteChallenge,
  type RegistrationResponseJSON,
} from "../../auth/webauthn.ts";
import { signJwt, buildJwtCookie, isLocalhost } from "../../auth/jwt.ts";
import { requireAdmin } from "../../auth/middleware.ts";
import { createLogger } from "../../logger.ts";

const log = createLogger("api-invites");

// ---------------------------------------------------------------------------
// GET /api/invites/:code — validate invite
// ---------------------------------------------------------------------------

export async function handleGetInvite(_req: Request, code: string): Promise<Response> {
  const invite = await db.query.userInvites.findFirst({
    where: eq(userInvites.code, code),
  });

  if (!invite) {
    return Response.json({ error: "Invite not found" }, { status: 404 });
  }

  if (invite.usedBy) {
    return Response.json({ error: "Invite already used" }, { status: 410 });
  }

  if (invite.expiresAt < new Date()) {
    return Response.json({ error: "Invite expired" }, { status: 410 });
  }

  return Response.json({ displayName: invite.displayName });
}

// ---------------------------------------------------------------------------
// POST /api/invites/:code/register/options
// ---------------------------------------------------------------------------

export async function handleInviteRegisterOptions(_req: Request, code: string): Promise<Response> {
  const invite = await db.query.userInvites.findFirst({
    where: eq(userInvites.code, code),
  });

  if (!invite || invite.usedBy || invite.expiresAt < new Date()) {
    return Response.json({ error: "Invalid or expired invite" }, { status: 400 });
  }

  // Use invite code as temporary user ID for options generation
  const options = await generateRegOptions(code, invite.displayName);
  storeChallenge(`invite:${code}`, options.challenge);
  return Response.json(options);
}

// ---------------------------------------------------------------------------
// POST /api/invites/:code/register/verify
// ---------------------------------------------------------------------------

export async function handleInviteRegisterVerify(req: Request, code: string): Promise<Response> {
  // Re-check invite validity at verify time
  const invite = await db.query.userInvites.findFirst({
    where: eq(userInvites.code, code),
  });

  if (!invite || invite.usedBy || invite.expiresAt < new Date()) {
    return Response.json({ error: "Invalid or expired invite" }, { status: 400 });
  }

  let body: RegistrationResponseJSON;
  try {
    body = (await req.json()) as RegistrationResponseJSON;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const expectedChallenge = getAndDeleteChallenge(`invite:${code}`);
  if (!expectedChallenge) {
    return Response.json({ error: "Challenge expired or not found" }, { status: 400 });
  }

  try {
    const verification = await verifyRegResponse(body, expectedChallenge);
    if (!verification.verified || !verification.registrationInfo) {
      return Response.json({ error: "Verification failed" }, { status: 400 });
    }

    const { credential, credentialDeviceType, credentialBackedUp } = verification.registrationInfo;

    // Create user + credential + mark invite used in a transaction-like sequence
    const [user] = await db
      .insert(users)
      .values({
        displayName: invite.displayName,
        isAdmin: invite.isAdmin,
      })
      .returning();

    await db.insert(userCredentials).values({
      userId: user!.id,
      credentialId: credential.id,
      publicKey: credential.publicKey,
      counter: credential.counter,
      deviceType: credentialDeviceType,
      backedUp: credentialBackedUp,
      transports: credential.transports,
    });

    await db
      .update(userInvites)
      .set({ usedBy: user!.id, usedAt: new Date() })
      .where(eq(userInvites.id, invite.id));

    const token = await signJwt({
      id: user!.id,
      name: user!.displayName,
      admin: user!.isAdmin,
    });

    log.info("invite redeemed", {
      userId: user!.id,
      displayName: user!.displayName,
      inviteCode: code,
    });

    return Response.json(
      {
        verified: true,
        user: { id: user!.id, name: user!.displayName, admin: user!.isAdmin },
      },
      { headers: { "Set-Cookie": buildJwtCookie(token, isLocalhost(req)) } },
    );
  } catch (error) {
    log.error("invite registration failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return Response.json({ error: "Verification failed" }, { status: 400 });
  }
}

// ---------------------------------------------------------------------------
// POST /api/invites — create invite (admin only)
// ---------------------------------------------------------------------------

export async function handleCreateInvite(req: Request): Promise<Response> {
  const authResult = await requireAdmin(req);
  if ("error" in authResult) return authResult.error;

  let body: { displayName?: string; isAdmin?: boolean; expiresInDays?: number };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.displayName || typeof body.displayName !== "string") {
    return Response.json({ error: "displayName is required" }, { status: 400 });
  }

  const expiresInDays = body.expiresInDays ?? 7;
  const expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000);

  const [invite] = await db
    .insert(userInvites)
    .values({
      code: crypto.randomUUID(),
      createdBy: authResult.user.id,
      displayName: body.displayName,
      isAdmin: body.isAdmin ?? false,
      expiresAt,
    })
    .returning();

  log.info("invite created", {
    code: invite!.code,
    displayName: body.displayName,
    createdBy: authResult.user.id,
  });

  return Response.json({
    code: invite!.code,
    displayName: invite!.displayName,
    isAdmin: invite!.isAdmin,
    expiresAt: invite!.expiresAt.toISOString(),
  });
}
