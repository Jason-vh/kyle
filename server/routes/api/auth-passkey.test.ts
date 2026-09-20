import { expect, test } from "bun:test";
import { handlePasskeyLoginOptions, handlePasskeyLoginVerify } from "./auth-passkey.ts";
import { getAndDeleteChallenge } from "#server/auth/webauthn.ts";
import { readFlowCookie } from "#server/auth/flow-cookie.ts";

const url = "https://kyle.test/api/auth/passkey/login";

async function startLogin() {
  const response = await handlePasskeyLoginOptions(
    new Request(`${url}/options`, { method: "POST" }),
  );
  const options = (await response.json()) as { challenge: string };
  const cookie = response.headers.get("set-cookie")!;
  const request = new Request(`${url}/verify`, { headers: { cookie } });
  const binding = readFlowCookie(request, "kyle_passkey_login");
  return { options, cookie, binding };
}

test("concurrent sign-ins keep separate single-use challenges", async () => {
  const [first, second] = await Promise.all([startLogin(), startLogin()]);

  expect(first.binding).not.toBe(second.binding);
  expect(getAndDeleteChallenge(`login:${first.binding}`)).toBe(first.options.challenge);
  expect(getAndDeleteChallenge(`login:${second.binding}`)).toBe(second.options.challenge);
  expect(getAndDeleteChallenge(`login:${first.binding}`)).toBeNull();
  expect(first.cookie).toContain("HttpOnly");
  expect(first.cookie).toContain("SameSite=Strict");
  expect(first.cookie).toContain("Secure");
});

test("an unbound verification cannot consume another browser's challenge", async () => {
  const login = await startLogin();
  const response = await handlePasskeyLoginVerify(
    new Request(`${url}/verify`, {
      method: "POST",
      body: JSON.stringify({ id: "unknown" }),
    }),
  );

  expect(response.status).toBe(400);
  expect(getAndDeleteChallenge(`login:${login.binding}`)).toBe(login.options.challenge);
});
