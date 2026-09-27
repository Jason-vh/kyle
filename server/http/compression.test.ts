import { expect, test } from "bun:test";
import { tmpdir } from "node:os";
import { acceptsGzip, compress } from "./compression.ts";

const large = { items: Array.from({ length: 200 }, (_, id) => ({ id, title: `Title ${id}` })) };

function request(acceptEncoding?: string, method = "GET"): Request {
  const headers = acceptEncoding === undefined ? undefined : { "accept-encoding": acceptEncoding };
  return new Request("http://localhost/api/library", { method, headers });
}

test("reads gzip out of an Accept-Encoding list, and respects a refusal", () => {
  expect(acceptsGzip(request("gzip, deflate, br"))).toBe(true);
  expect(acceptsGzip(request("br;q=1.0, GZIP;q=0.5"))).toBe(true);
  expect(acceptsGzip(request("gzip;q=0"))).toBe(false);
  expect(acceptsGzip(request("gzip;q=0.000"))).toBe(false);
  expect(acceptsGzip(request("br"))).toBe(false);
  expect(acceptsGzip(request())).toBe(false);
});

test("gzips a large JSON body, keeping status and headers", async () => {
  const original = Response.json(large, { status: 201, headers: { "Set-Cookie": "a=b" } });
  const response = await compress(request("gzip"), original);

  expect(response.status).toBe(201);
  expect(response.headers.get("content-encoding")).toBe("gzip");
  expect(response.headers.get("vary")).toBe("Accept-Encoding");
  expect(response.headers.get("set-cookie")).toBe("a=b");
  const body = new Uint8Array(await response.arrayBuffer());
  expect(JSON.parse(new TextDecoder().decode(Bun.gunzipSync(body)))).toEqual(large);
});

test("leaves the body alone for a client that cannot read gzip, but still varies on it", async () => {
  const response = await compress(request(), Response.json(large));

  expect(response.headers.get("content-encoding")).toBeNull();
  expect(response.headers.get("vary")).toBe("Accept-Encoding");
  expect(await response.json()).toEqual(large);
});

test("does not compress what is too small to gain from it", async () => {
  const response = await compress(request("gzip"), Response.json({ ok: true }));

  expect(response.headers.get("content-encoding")).toBeNull();
  expect(await response.json()).toEqual({ ok: true });
});

test("passes through bodies that are not text, empty, already encoded, or a HEAD", async () => {
  const image = new Response(new Uint8Array(4096), { headers: { "Content-Type": "image/png" } });
  const empty = new Response(null, { status: 302, headers: { Location: "/home" } });
  const encoded = new Response("x".repeat(4096), {
    headers: { "Content-Type": "text/plain", "Content-Encoding": "br" },
  });
  const head = Response.json(large);

  expect(await compress(request("gzip"), image)).toBe(image);
  expect(await compress(request("gzip"), empty)).toBe(empty);
  expect(await compress(request("gzip"), encoded)).toBe(encoded);
  expect(await compress(request("gzip", "HEAD"), head)).toBe(head);
});

test("gzips a built asset served straight from disk", async () => {
  const source = `export const titles = ${JSON.stringify(large)};`;
  const path = `${tmpdir()}/kyle-asset-${crypto.randomUUID()}.js`;
  await Bun.write(path, source);
  const response = await compress(request("gzip"), new Response(Bun.file(path)));

  expect(response.headers.get("content-encoding")).toBe("gzip");
  const body = new Uint8Array(await response.arrayBuffer());
  expect(new TextDecoder().decode(Bun.gunzipSync(body))).toBe(source);
});
