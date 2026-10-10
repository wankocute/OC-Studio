import { rm } from "node:fs/promises";

import pg from "pg";

import { ensureTestDatabase, migrateTestDatabase, PROJECT_TABLES } from "../src/test/test-database";

import { E2E_DATABASE_URL, E2E_MEDIA_DIR } from "./environment";

/**
 * Fresh, isolated state for every E2E run: a dedicated `*_e2e_test` database (created and
 * migrated if needed, then emptied) and a dedicated media directory. The developer's
 * database and uploads are never touched.
 */
export default async function globalSetup(): Promise<void> {
  await ensureTestDatabase(E2E_DATABASE_URL);
  await migrateTestDatabase(E2E_DATABASE_URL);

  const client = new pg.Client({ connectionString: E2E_DATABASE_URL });
  await client.connect();
  try {
    const { rows } = await client.query<{ name: string }>("select current_database() as name");
    if (!rows[0]?.name.endsWith("_e2e_test"))
      throw new Error("Refusing to reset a non-E2E database.");
    await client.query(`truncate table ${PROJECT_TABLES.join(", ")} restart identity cascade`);
  } finally {
    await client.end();
  }

  await rm(E2E_MEDIA_DIR, { recursive: true, force: true });
}
