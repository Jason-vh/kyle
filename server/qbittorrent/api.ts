import { createLogger } from "../logger.ts";

const log = createLogger("qbittorrent");

const QBITTORRENT_HOST = process.env.QBITTORRENT_HOST;
const QBITTORRENT_USERNAME = process.env.QBITTORRENT_USERNAME;
const QBITTORRENT_PASSWORD = process.env.QBITTORRENT_PASSWORD;

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
  if (!QBITTORRENT_HOST || !QBITTORRENT_USERNAME || !QBITTORRENT_PASSWORD) {
    throw new Error(
      "QBITTORRENT_HOST, QBITTORRENT_USERNAME, and QBITTORRENT_PASSWORD environment variables are required",
    );
  }
  return {
    host: QBITTORRENT_HOST,
    username: QBITTORRENT_USERNAME,
    password: QBITTORRENT_PASSWORD,
  };
}

async function login(): Promise<void> {
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

async function makeRequest(
  endpoint: string,
  options: RequestInit = {},
  retry = true,
): Promise<unknown> {
  const { host } = getConfig();

  if (!sessionCookie) {
    await login();
  }

  const url = `${host}/api/v2${endpoint}`;

  const response = await fetch(url, {
    ...options,
    signal: AbortSignal.timeout(15_000),
    headers: {
      Cookie: `SID=${sessionCookie}`,
      ...options.headers,
    },
  });

  if (response.status === 403 && retry) {
    log.info("session expired, re-authenticating");
    sessionCookie = null;
    await login();
    return makeRequest(endpoint, options, false);
  }

  if (!response.ok) {
    const body = await response.text().catch(() => "(unreadable)");
    throw new Error(`qBittorrent API error ${response.status} ${response.statusText}: ${body}`);
  }

  const text = await response.text();
  if (!text) return undefined;
  return JSON.parse(text);
}

export async function getTorrents(filter: TorrentFilter = "all"): Promise<QBittorrentTorrent[]> {
  return (await makeRequest(`/torrents/info?filter=${filter}`)) as QBittorrentTorrent[];
}

export async function deleteTorrents(hashes: string[], deleteFiles: boolean = true): Promise<void> {
  await makeRequest("/torrents/delete", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      hashes: hashes.join("|"),
      deleteFiles: deleteFiles.toString(),
    }).toString(),
  });
}
