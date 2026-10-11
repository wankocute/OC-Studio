/**
 * Apply pending database migrations. Runs automatically in the Vercel build (`pnpm vercel-build`)
 * before `next build`, so a deployment never serves code newer than its schema.
 * Usage (from the project root): node scripts/migrate.mjs
 * Locally, load the env file explicitly: node --env-file=.env.local scripts/migrate.mjs
 *
 * Plain Node ESM on purpose: only runtime dependencies (`pg`, `drizzle-orm`), no tsx, no
 * drizzle-kit and no .env.local. It shares the `drizzle.__drizzle_migrations` journal with
 * `pnpm db:migrate`, so either can run first. Migrations are additive (see
 * docs/database-migrations.md); a failure stops the build and the previous deployment stays live.
 *
 * URL: DATABASE_URL_UNPOOLED (Neon's direct connection — migrations take session-level locks a
 * transaction pooler does not support), falling back to DATABASE_URL.
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
  const vercelEnv = process.env.VERCEL_ENV;
  // Preview deployments (other git branches) must never change the production database.
  if (vercelEnv && vercelEnv !== "production") {
    console.log(`→ Bỏ qua migration (môi trường Vercel "${vercelEnv}", không phải production).`);
    return 0;
  }

  const url = process.env.DATABASE_URL_UNPOOLED?.trim() || process.env.DATABASE_URL?.trim();
  if (!url) {
    console.error(
      "✖ Chưa có DATABASE_URL_UNPOOLED / DATABASE_URL. Trên Vercel: kết nối Neon trong tab " +
        "Storage của project (xem docs/deploy-vercel.md), rồi deploy lại.",
    );
    return 1;
  }

  const pool = new pg.Pool({ connectionString: url, max: 1, connectionTimeoutMillis: 30_000 });
  try {
    console.log(`→ Chạy migration trên ${describe(url)}…`);
    await migrate(drizzle({ client: pool }), { migrationsFolder });
    console.log("✔ Database đã ở phiên bản schema mới nhất.");
    return 0;
  } catch (error) {
    console.error("✖ Migration thất bại — bản deploy này bị dừng:", error?.message ?? error);
    return 1;
  } finally {
    await pool.end();
  }
}

process.exit(await main());
