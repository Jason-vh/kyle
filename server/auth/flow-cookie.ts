import { isLocalhost, parseCookies } from "./jwt.ts";

export function createFlowCookie(
  req: Request,
  name: string,
  maxAge: number,
  sameSite: "Strict" | "Lax" = "Strict",
): { binding: string; cookie: string } {
  const binding = crypto.randomUUID();
  const parts = [
    `${name}=${binding}`,
    "Path=/api/auth",
    `Max-Age=${maxAge}`,
    "HttpOnly",
    `SameSite=${sameSite}`,
  ];
  if (!isLocalhost(req)) parts.push("Secure");
  return { binding, cookie: parts.join("; ") };
}

export function readFlowCookie(req: Request, name: string): string | undefined {
  const value = parseCookies(req.headers.get("cookie") ?? "")[name];
  if (!value || !/^[0-9a-f-]{36}$/.test(value)) return undefined;
  return value;
}
