import "server-only";

import { attachDatabasePool } from "@vercel/functions";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import { getServerEnv } from "@/lib/env";

import * as schema from "./schema";

export type Database = NodePgDatabase<typeof schema>;
export type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
/** Anything that can run queries: the database or an open transaction. */
export type DbExecutor = Database | Transaction;

export class DatabaseNotConfiguredError extends Error {
  constructor() {
    super("DATABASE_URL chưa được cấu hình. Xem .env.example và README.");
    this.name = "DatabaseNotConfiguredError";
  }
}

export type DatabaseClient = { pool: Pool; db: Database };

/**
 * On Vercel each function instance gets its own pool, and many instances may run at once, so
 * the pool stays small (the app connects through Neon's pooler, `DATABASE_URL`), and idle
 * clients are closed quickly so a suspended instance does not hold connections.
 */
const SERVERLESS = Boolean(process.env.VERCEL);

/** Create a pool + Drizzle instance for an explicit URL (scripts, integration tests). */
export function createDatabase(connectionString: string): DatabaseClient {
  const pool = new Pool({
    connectionString,
    max: SERVERLESS ? 3 : 10,
    // Neon may need a few seconds to wake a suspended (scaled-to-zero) compute.
    connectionTimeoutMillis: SERVERLESS ? 15_000 : 5_000,
    idleTimeoutMillis: SERVERLESS ? 5_000 : 30_000,
  });
  // Releases idle clients before Vercel suspends the instance; a no-op anywhere else.
  attachDatabasePool(pool);
  return { pool, db: drizzle({ client: pool, schema }) };
}

// Reuse a single pool across hot reloads in development.
const globalForDb = globalThis as typeof globalThis & { __ocStudioDb?: DatabaseClient };

function getClient(): DatabaseClient {
  if (globalForDb.__ocStudioDb) return globalForDb.__ocStudioDb;

  const { DATABASE_URL } = getServerEnv();
  if (!DATABASE_URL) throw new DatabaseNotConfiguredError();

  const client = createDatabase(DATABASE_URL);
  globalForDb.__ocStudioDb = client;
  return client;
}

/** Drizzle instance. Connects lazily; throws `DatabaseNotConfiguredError` when no URL is set. */
export function getDb(): Database {
  return getClient().db;
}

/** Close the pool so CLI scripts can exit. */
export async function closeDb(): Promise<void> {
  const client = globalForDb.__ocStudioDb;
  if (!client) return;
  globalForDb.__ocStudioDb = undefined;
  await client.pool.end();
}
