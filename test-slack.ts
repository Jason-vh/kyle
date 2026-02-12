/**
 * Send a message to Kyle's /slack/events endpoint as if it came from Slack.
 *
 * Usage:
 *   bun run test-slack.ts "hello kyle"
 *   bun run test-slack.ts "follow up" --thread 1770916700.760769
 *   bun run test-slack.ts "hello" --channel C09AF7W8DME
 */

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
const CHANNEL = getArg("--channel") ?? process.env.SLACK_TEST_CHANNEL ?? "C09AF7W8DME";
const THREAD_TS = getArg("--thread");
const signingSecret = process.env.SLACK_SIGNING_SECRET;

const message = process.argv[2];
if (!message || message.startsWith("--")) {
  console.error("Usage: bun run test-slack.ts <message> [--thread <ts>] [--channel <id>]");
  process.exit(1);
}
if (!signingSecret) {
  console.error("SLACK_SIGNING_SECRET is required (set in .env or env var)");
  process.exit(1);
}

function getArg(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  return idx !== -1 ? process.argv[idx + 1] : undefined;
}

const ts = `${Math.floor(Date.now() / 1000)}.${String(Math.floor(Math.random() * 1_000_000)).padStart(6, "0")}`;
const eventId = `Ev_test_${Date.now()}`;

const payload = {
  type: "event_callback",
  event_id: eventId,
  event: {
    type: "message",
    channel: CHANNEL,
    user: "U_TEST_USER",
    text: message,
    ts,
    ...(THREAD_TS ? { thread_ts: THREAD_TS } : {}),
  },
};

const body = JSON.stringify(payload);
const timestamp = Math.floor(Date.now() / 1000).toString();
const baseString = `v0:${timestamp}:${body}`;

const key = await crypto.subtle.importKey(
  "raw",
  new TextEncoder().encode(signingSecret),
  { name: "HMAC", hash: "SHA-256" },
  false,
  ["sign"]
);
const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(baseString));
const signature = `v0=${Buffer.from(sig).toString("hex")}`;

console.log(`Sending to ${BASE_URL}/slack/events`);
console.log(`Channel: ${CHANNEL}${THREAD_TS ? ` | Thread: ${THREAD_TS}` : " | New thread"}`);
console.log(`Message: ${message}\n`);

const res = await fetch(`${BASE_URL}/slack/events`, {
  method: "POST",
  headers: {
    "content-type": "application/json",
    "x-slack-request-timestamp": timestamp,
    "x-slack-signature": signature,
  },
  body,
});

console.log(`Status: ${res.status}`);
const text = await res.text();
try {
  console.log("Response:", JSON.parse(text));
} catch {
  console.log("Response:", text);
}
