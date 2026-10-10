/**
 * Integration-test database helpers. Never point these at a database you care about:
 * every function refuses to run unless the database name ends with `_test`.
 *
 * URL: `TEST_DATABASE_URL` if set, otherwise `DATABASE_URL` with the database name suffixed
 * by `_test` (e.g. `oc_studio` → `oc_studio_test`), so no second password has to be stored.
 */
import { existsSync } from "node:fs";
import path from "node:path";

import { loadEnvConfig } from "@next/env";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";

export const MIGRATIONS_FOLDER = path.join(process.cwd(), "src", "db", "migrations");

/** Project tables, children first. Used only to wipe the test database between tests. */
export const PROJECT_TABLES = [
  "character_references",
  "character_tags",
  "character_collections",
  "character_media",
  "tags",
  "collections",
  "media_assets",
  "characters",
  "library_field_definitions",
  "library_field_groups",
] as const;

function databaseName(url: string): string {
  return decodeURIComponent(new URL(url).pathname.slice(1));
}

/**
 * With NODE_ENV=test, Next.js loads `.env.test.local` / `.env.test` / `.env` but deliberately
 * skips `.env.local`. Fall back to `.env.local` (without overriding anything already set) so the
 * test URL can be derived from the developer's DATABASE_URL.
 */
function loadEnvironment(): void {
  loadEnvConfig(process.cwd());
  const local = path.join(process.cwd(), ".env.local");
  if (!process.env.TEST_DATABASE_URL && !process.env.DATABASE_URL && existsSync(local)) {
    process.loadEnvFile(local);
  }
}

export function resolveTestDatabaseUrl(): string {
  loadEnvironment();
  const explicit = process.env.TEST_DATABASE_URL?.trim();
  const main = process.env.DATABASE_URL?.trim();
  if (!explicit && !main) {
    throw new Error(
      "Integration tests cần TEST_DATABASE_URL hoặc DATABASE_URL trong .env.local (xem README).",
    );
  }

  const url = new URL(explicit || main!);
  if (!explicit) url.pathname = `/${databaseName(main!)}_test`;
  const name = databaseName(url.toString());

  if (!/^[a-z0-9_]+_test$/.test(name)) {
    throw new Error(
      `Từ chối dùng database "${name}" cho integration tests: tên phải kết thúc bằng _test.`,
    );
  }
  if (main && databaseName(main) === name && new URL(main).host === url.host) {
    throw new Error("Database test trùng với DATABASE_URL — từ chối chạy để bảo vệ dữ liệu thật.");
  }
  return url.toString();
}

/** Create the test database if it does not exist (never drops anything). */
export async function ensureTestDatabase(url: string): Promise<void> {
  const name = databaseName(url);
  const maintenance = new URL(url);
  maintenance.pathname = "/postgres";
  const client = new pg.Client({ connectionString: maintenance.toString() });
  await client.connect();
  try {
    const exists = await client.query("select 1 from pg_database where datname = $1", [name]);
    // `name` is validated by resolveTestDatabaseUrl (^[a-z0-9_]+_test$), safe to quote as identifier.
    if (exists.rowCount === 0) await client.query(`create database "${name}"`);
  } finally {
    await client.end();
  }
}

export async function migrateTestDatabase(url: string): Promise<void> {
  const pool = new pg.Pool({ connectionString: url, max: 1 });
  try {
    await migrate(drizzle({ client: pool }), { migrationsFolder: MIGRATIONS_FOLDER });
  } finally {
    await pool.end();
  }
}

type Executor = { execute: (query: ReturnType<typeof sql>) => Promise<{ rows: unknown[] }> };

/** Empty every project table. Refuses to run on a database whose name does not end in `_test`. */
export async function resetTestData(db: Executor): Promise<void> {
  const { rows } = await db.execute(sql`select current_database() as name`);
  const name = (rows[0] as { name: string }).name;
  if (!name.endsWith("_test")) {
    throw new Error(`Từ chối xóa dữ liệu trên database "${name}".`);
  }
  await db.execute(sql.raw(`truncate table ${PROJECT_TABLES.join(", ")} restart identity cascade`));
}
