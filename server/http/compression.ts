const COMPRESSIBLE_TYPE = /^(text\/|application\/(json|javascript|xml)|image\/svg\+xml)/;
const MIN_COMPRESSED_BYTES = 1024;

export function acceptsGzip(req: Request): boolean {
  const header = req.headers.get("accept-encoding") ?? "";
  return header.split(",").some((entry) => {
    const [coding, ...params] = entry.split(";").map((part) => part.trim().toLowerCase());
    return coding === "gzip" && !params.some((param) => /^q=0(\.0*)?$/.test(param));
  });
}

function isCompressible(response: Response): boolean {
  const contentType = response.headers.get("content-type") ?? "";
  if (response.headers.has("content-encoding") || !COMPRESSIBLE_TYPE.test(contentType))
    return false;
  return response.body !== null;
}

export async function compress(req: Request, response: Response): Promise<Response> {
  if (req.method === "HEAD" || !isCompressible(response)) return response;

  const headers = new Headers(response.headers);
  headers.append("Vary", "Accept-Encoding");
  const init = { status: response.status, statusText: response.statusText, headers };

  if (!acceptsGzip(req)) return new Response(response.body, init);

  const body = new Uint8Array(await response.arrayBuffer());
  if (body.byteLength < MIN_COMPRESSED_BYTES) return new Response(body, init);

  headers.set("Content-Encoding", "gzip");
  headers.delete("Content-Length");
  return new Response(Bun.gzipSync(body), init);
}
