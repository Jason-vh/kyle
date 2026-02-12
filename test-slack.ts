/**
 * Test script for the /slack/events endpoint.
 * Signs requests with SLACK_SIGNING_SECRET just like Slack does.
 *
 * Usage:
 *   bun run dev          # in one terminal
 *   bun run test-slack.ts # in another
 */

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
const signingSecret = process.env.SLACK_SIGNING_SECRET;

if (!signingSecret) {
  console.error("SLACK_SIGNING_SECRET is required in .env");
  process.exit(1);
}

async function sign(body: string): Promise<{ timestamp: string; signature: string }> {
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

  return { timestamp, signature };
}

async function send(name: string, payload: object) {
  const body = JSON.stringify(payload);
  const { timestamp, signature } = await sign(body);

  console.log(`\n--- ${name} ---`);
  console.log(`POST ${BASE_URL}/slack/events`);

  const res = await fetch(`${BASE_URL}/slack/events`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-slack-request-timestamp": timestamp,
      "x-slack-signature": signature,
    },
    body,
  });

  const text = await res.text();
  console.log(`Status: ${res.status}`);
  try {
    console.log(`Body:`, JSON.parse(text));
  } catch {
    console.log(`Body:`, text);
  }
}

// --- Test cases ---

// 1. URL verification challenge
await send("url_verification", {
  type: "url_verification",
  challenge: "test_challenge_abc123",
  token: "test",
});

// 2. Invalid signature (should 401)
console.log("\n--- Invalid signature ---");
const badRes = await fetch(`${BASE_URL}/slack/events`, {
  method: "POST",
  headers: {
    "content-type": "application/json",
    "x-slack-request-timestamp": Math.floor(Date.now() / 1000).toString(),
    "x-slack-signature": "v0=bad_signature",
  },
  body: JSON.stringify({ type: "event_callback" }),
});
console.log(`Status: ${badRes.status} (expected 401)`);

// 3. Retry header (should 200 immediately, no processing)
await send("Retry skip (x-slack-retry-num)", {
  type: "event_callback",
  event_id: "Ev_retry_test",
  event: {
    type: "message",
    channel: "C_TEST",
    user: "U_TEST",
    text: "this should be skipped",
    ts: "1234567890.000001",
  },
});
// Re-send with retry header
{
  const body = JSON.stringify({
    type: "event_callback",
    event_id: "Ev_retry_test2",
    event: { type: "message", channel: "C_TEST", user: "U_TEST", text: "retry", ts: "1234567890.000002" },
  });
  const { timestamp, signature } = await sign(body);
  console.log("\n--- Retry header (should skip) ---");
  const res = await fetch(`${BASE_URL}/slack/events`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-slack-request-timestamp": timestamp,
      "x-slack-signature": signature,
      "x-slack-retry-num": "1",
      "x-slack-retry-reason": "http_timeout",
    },
    body,
  });
  console.log(`Status: ${res.status} (expected 200, skipped)`);
}

// 4. Bot message (should be ignored by shouldProcess)
await send("Bot message (should ignore)", {
  type: "event_callback",
  event_id: "Ev_bot_test",
  event: {
    type: "message",
    channel: "C_TEST",
    bot_id: "B_BOT",
    text: "I am a bot",
    ts: "1234567890.000003",
  },
});

// 5. Real message (will ack 200, then try to process async — agent will fail without DB but proves the flow)
await send("Real user message", {
  type: "event_callback",
  event_id: "Ev_real_test",
  event: {
    type: "message",
    channel: "C_TEST",
    user: "U_TEST",
    text: "<@U_KYLE_BOT> what movies do you recommend?",
    ts: "1234567890.000004",
  },
});

// 6. Dedup — same event_id again
await send("Dedup (same event_id, should skip)", {
  type: "event_callback",
  event_id: "Ev_real_test",
  event: {
    type: "message",
    channel: "C_TEST",
    user: "U_TEST",
    text: "duplicate",
    ts: "1234567890.000005",
  },
});

// 7. Thread reply (has thread_ts)
await send("Thread reply", {
  type: "event_callback",
  event_id: "Ev_thread_test",
  event: {
    type: "message",
    channel: "C_TEST",
    user: "U_TEST",
    text: "follow up question",
    ts: "1234567890.000006",
    thread_ts: "1234567890.000004",
  },
});

console.log("\n--- Done ---");
console.log("Check the dev server logs for async processing output.");
