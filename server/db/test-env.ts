/**
 * Points every test at a database of its own, before anything connects.
 *
 * `.env` is loaded by Bun at startup, so without this a test run would use the
 * development database and could delete real rows. Set `TEST_DATABASE_URL` to
 * run against a server instead — which is what CI does, so the suite is
 * checked against a real Postgres as well as the in-process one.
 */
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? "pglite://";
