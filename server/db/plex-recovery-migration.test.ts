import { expect, test } from "bun:test";
import { PGlite } from "@electric-sql/pglite";

test("recovery migration prefers active links, otherwise the latest Plex-created account", async () => {
  const client = new PGlite();
  const earlier = "00000000-0000-0000-0000-000000000001";
  const later = "00000000-0000-0000-0000-000000000002";
  const linked = "00000000-0000-0000-0000-000000000003";
  try {
    await client.exec(`
      CREATE TABLE users (id uuid PRIMARY KEY, plex_account_id text, created_at timestamp);
      CREATE TABLE platform_identities (platform text, platform_user_id text, user_id uuid, linked_at timestamp);
      INSERT INTO users VALUES
        ('${earlier}', '999', '2026-01-01'),
        ('${later}', '999', '2026-02-01'),
        ('${linked}', NULL, '2026-01-01');
      INSERT INTO platform_identities VALUES ('plex', '123', '${linked}', '2026-02-01');
    `);
    await client.exec(await Bun.file("drizzle/0026_plex_account_recovery.sql").text());
    expect(
      (await client.query("SELECT * FROM plex_account_owners ORDER BY plex_account_id")).rows,
    ).toEqual([
      { plex_account_id: "123", user_id: linked },
      { plex_account_id: "999", user_id: later },
    ]);
    await client.exec(`DROP TABLE plex_account_owners;
      INSERT INTO platform_identities VALUES ('plex', '999', '${earlier}', '2026-01-01');`);
    await client.exec(await Bun.file("drizzle/0026_plex_account_recovery.sql").text());
    expect(
      (await client.query("SELECT user_id FROM plex_account_owners WHERE plex_account_id = '999'"))
        .rows,
    ).toEqual([{ user_id: earlier }]);
  } finally {
    await client.close();
  }
});
