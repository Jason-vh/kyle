import { db } from "./server/db/index.ts";
import { users, userInvites } from "./server/db/schema.ts";

const displayName = process.argv[2];
if (!displayName) {
  console.error("Usage: bun run create-admin.ts <display-name>");
  process.exit(1);
}

const [user] = await db.insert(users).values({ displayName, isAdmin: true }).returning();

const code = crypto.randomUUID();
const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

await db.insert(userInvites).values({
  code,
  createdBy: user!.id,
  displayName,
  isAdmin: true,
  expiresAt,
});

const host = process.env.WEBAUTHN_ORIGIN ?? "http://localhost:5173";

console.log(`\nAdmin user created: ${user!.id}`);
console.log(`Display name: ${displayName}`);
console.log(`\nInvite link (expires in 7 days):`);
console.log(`${host}/invite/${code}\n`);

process.exit(0);
