/**
 * Apply pending database migrations (production start, e.g. Railway).
 * Usage: node scripts/migrate.mjs — run from the project root.
 *
 * Plain Node ESM on purpose: uses only runtime dependencies (`pg`, `drizzle-orm`), no tsx,
 * no drizzle-kit and no .env.local, so it works in a pruned production install. It shares the
 * `drizzle.__drizzle_migrations` journal with `pnpm db:migrate`, so either can run first.
 * Locally, load the env file explicitly: node --env-file=.env.local scripts/migrate.mjs
 */
import path from "node:path";
import { fileURLToPath } from "node:url";

import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";

const migrationsFolder = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "src",
  "db",
  "migrations",
);

/** Host and database only — never print credentials. */
function describe(url) {
  try {
    const { hostname, port, pathname } = new URL(url);
    return `${hostname}${port ? `:${port}` : ""}${pathname}`;
  } catch {
    return "(URL không hợp lệ)";
  }
}

async function main() {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    console.error(
      "✖ DATABASE_URL chưa được đặt. Trên Railway: Variables → DATABASE_URL = ${{Postgres.DATABASE_URL}}.",
    );
    return 1;
  }

  const pool = new pg.Pool({ connectionString: url, max: 1, connectionTimeoutMillis: 15_000 });
  try {
    console.log(`→ Chạy migration trên ${describe(url)}…`);
    await migrate(drizzle({ client: pool }), { migrationsFolder });
    console.log("✔ Database đã ở phiên bản schema mới nhất.");
    return 0;
  } catch (error) {
    console.error("✖ Migration thất bại — ứng dụng sẽ không khởi động:", error?.message ?? error);
    return 1;
  } finally {
    await pool.end();
  }
}

process.exit(await main());
