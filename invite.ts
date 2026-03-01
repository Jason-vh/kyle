import { db } from "./server/db/index.ts";
import { userInvites } from "./server/db/schema.ts";

const displayName = process.argv[2];
if (!displayName) {
  console.error("Usage: bun run invite.ts <display-name> [--expires <days>] [--admin]");
  process.exit(1);
}

let expiresInDays = 7;
let isAdmin = false;

for (let i = 3; i < process.argv.length; i++) {
  if (process.argv[i] === "--expires" && process.argv[i + 1]) {
    const raw = process.argv[i + 1]!;
    // Support "7d" or "7" format
    const match = raw.match(/^(\d+)d?$/);
    if (match) {
      expiresInDays = parseInt(match[1]!, 10);
    }
    i++;
  }
  if (process.argv[i] === "--admin") {
    isAdmin = true;
  }
}

const code = crypto.randomUUID();
const expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000);

await db.insert(userInvites).values({
  code,
  displayName,
  isAdmin,
  expiresAt,
});

const host = process.env.WEBAUTHN_ORIGIN ?? "http://localhost:5173";

console.log(`\nInvite created for: ${displayName}`);
console.log(`Admin: ${isAdmin}`);
console.log(`Expires: ${expiresAt.toISOString()}`);
console.log(`\nInvite link:`);
console.log(`${host}/invite/${code}\n`);

process.exit(0);
