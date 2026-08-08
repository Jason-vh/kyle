import { createLogger } from "../logger.ts";
import { createApiClient } from "../http/client.ts";
import { requireEnv } from "../config.ts";

const log = createLogger("qbittorrent");

let sessionCookie: string | null = null;

export interface QBittorrentTorrent {
  hash: string;
  name: string;
  size: number;
  progress: number;
  dlspeed: number;
  upspeed: number;
  num_seeds: number;
  num_leechs: number;
  ratio: number;
  state: string;
  category: string;
  tags: string;
  added_on: number;
  completion_on: number;
  save_path: string;
}

export type TorrentFilter =
  | "all"
  | "downloading"
  | "seeding"
  | "completed"
  | "paused"
  | "active"
  | "inactive"
  | "stalled"
  | "errored";

function getConfig() {
  const [host, username, password] = requireEnv(
    "QBITTORRENT_HOST",
    "QBITTORRENT_USERNAME",
    "QBITTORRENT_PASSWORD",
  );
  return { host, username, password };
}

/** Logs in unless a session cookie is already cached; `force` discards it first. */
async function login(force: boolean): Promise<void> {
  if (sessionCookie && !force) return;
  sessionCookie = null;

  const { host, username, password } = getConfig();

  const response = await fetch(`${host}/api/v2/auth/login`, {
    method: "POST",
    signal: AbortSignal.timeout(15_000),
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ username, password }).toString(),
  });

  if (!response.ok) {
    throw new Error(`qBittorrent login failed: ${response.status}`);
  }

  const setCookie = response.headers.get("set-cookie");
  if (setCookie) {
    const match = setCookie.match(/SID=([^;]+)/);
    if (match) {
      sessionCookie = match[1]!;
      log.info("authenticated with qBittorrent");
      return;
    }
  }

  throw new Error("qBittorrent login did not return a session cookie");
}

const request = createApiClient({
  service: "qbittorrent",
  config: () => ({
    baseUrl: `${getConfig().host}/api/v2`,
    headers: { Cookie: `SID=${sessionCookie}` },
  }),
  authenticate: login,
  isAuthFailure: (response) => response.status === 403,
});

export async function getTorrents(filter: TorrentFilter = "all"): Promise<QBittorrentTorrent[]> {
  return request<QBittorrentTorrent[]>(`/torrents/info?filter=${filter}`);
}

export async function deleteTorrents(hashes: string[], deleteFiles: boolean = true): Promise<void> {
  await request<void>("/torrents/delete", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      hashes: hashes.join("|"),
      deleteFiles: deleteFiles.toString(),
    }).toString(),
  });
}
