import { ensureTestDatabase, migrateTestDatabase, resolveTestDatabaseUrl } from "./test-database";

/** Runs once before the integration suite: create (if missing) and migrate the test database. */
export default async function setup(): Promise<void> {
  const url = resolveTestDatabaseUrl();
  await ensureTestDatabase(url);
  await migrateTestDatabase(url);
}
