/**
 * Obtains a Plex access token for the server owner by polling a PIN.
 * Kyle uses this token as its service credential for reading the Plex server.
 */
import { buildAuthAppUrl, createPin, getAccount, getPin } from "../server/plex/api.ts";

const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS = 5 * 60 * 1000;

if (!process.env.PLEX_CLIENT_IDENTIFIER) {
  console.error("PLEX_CLIENT_IDENTIFIER is not set. Add this to your .env, then re-run:\n");
  console.error(`PLEX_CLIENT_IDENTIFIER=${crypto.randomUUID()}\n`);
  process.exit(1);
}

const pin = await createPin();

console.log("\nOpen this URL and sign in as the Plex server owner:\n");
console.log(`  ${buildAuthAppUrl(pin.code)}\n`);
console.log("Waiting for you to finish signing in…");

const deadline = Date.now() + POLL_TIMEOUT_MS;
let authToken: string | null = null;

while (!authToken && Date.now() < deadline) {
  await Bun.sleep(POLL_INTERVAL_MS);
  authToken = (await getPin(pin.id)).authToken;
}

if (!authToken) {
  console.error("\nTimed out waiting for the PIN to be claimed.");
  process.exit(1);
}

const account = await getAccount(authToken);

console.log(`\nSigned in as ${account.username} (account id ${account.id}).`);
console.log("\nAdd this to your .env:\n");
console.log(`PLEX_SERVER_TOKEN=${authToken}\n`);
console.log("Revoke it any time from Plex → Settings → Authorized Devices → Kyle.\n");

process.exit(0);
