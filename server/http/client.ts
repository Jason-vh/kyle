import { createLogger } from "../logger.ts";
import { safeJsonParse } from "../json.ts";

const DEFAULT_TIMEOUT_MS = 15_000;

export interface ApiClientConfig {
  baseUrl: string;
  headers?: Record<string, string>;
}

export interface ApiClientOptions {
  /** Service name used in log and error messages. */
  service: string;
  /** Resolved per request so missing configuration fails at call time, not import time. */
  config: () => ApiClientConfig;
  timeoutMs?: number;
  /** Session login for APIs that authenticate with a cookie instead of a header. Called
   * before every request; `force` asks it to discard a cached session first. */
  authenticate?: (force: boolean) => Promise<void>;
  /** Marks a response as an expired session, retried once after re-authenticating. */
  isAuthFailure?: (response: Response) => boolean;
}

const MAX_BODY_SUMMARY = 160;

/**
 * A short description of an error body. A failing service often answers with a
 * whole HTML error page, which is useless in a message and drowns out the
 * status; its <title> says the same thing in one line.
 */
export function summariseBody(body: unknown): string {
  if (body === undefined || body === null) return "no body";

  const text = typeof body === "string" ? body : JSON.stringify(body);
  const title = text.match(/<title>([^<]*)<\/title>/i)?.[1];
  const collapsed = (title ?? text).replace(/\s+/g, " ").trim();

  return collapsed.length > MAX_BODY_SUMMARY
    ? `${collapsed.slice(0, MAX_BODY_SUMMARY)}…`
    : collapsed;
}

export class ApiError extends Error {
  constructor(
    readonly service: string,
    readonly status: number,
    readonly body: unknown,
  ) {
    super(`${service} API error ${status}: ${summariseBody(body)}`);
    this.name = "ApiError";
  }
}

async function readBody(response: Response): Promise<unknown> {
  const text = await response.text().catch(() => "(unreadable)");
  if (!text) return undefined;
  return safeJsonParse(text) ?? text;
}

export type ApiRequest = <T>(endpoint: string, options?: RequestInit) => Promise<T>;

/** Builds a JSON HTTP client with uniform timeouts, error reporting, and optional session auth. */
export function createApiClient(options: ApiClientOptions): ApiRequest {
  const { service, config, authenticate, isAuthFailure } = options;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const log = createLogger(service);

  async function send(endpoint: string, init: RequestInit): Promise<Response> {
    const { baseUrl, headers } = config();
    return fetch(`${baseUrl}${endpoint}`, {
      ...init,
      signal: AbortSignal.timeout(timeoutMs),
      headers: { ...headers, ...init.headers },
    });
  }

  return async function request<T>(endpoint: string, init: RequestInit = {}): Promise<T> {
    if (authenticate) await authenticate(false);

    let response = await send(endpoint, init);

    if (isAuthFailure?.(response) && authenticate) {
      log.info("session rejected, re-authenticating", { endpoint });
      await authenticate(true);
      response = await send(endpoint, init);
    }

    if (!response.ok) {
      const body = await readBody(response);
      log.error("request failed", {
        endpoint,
        status: response.status,
        body: summariseBody(body),
      });
      throw new ApiError(service, response.status, body);
    }

    return (await readBody(response)) as T;
  };
}
