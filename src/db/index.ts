import "server-only";

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

/** Create a pool + Drizzle instance for an explicit URL (scripts, integration tests). */
export function createDatabase(connectionString: string): DatabaseClient {
  const pool = new Pool({
    connectionString,
    max: 10,
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 30_000,
  });
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
