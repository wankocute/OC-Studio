import "server-only";

import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import { getServerEnv } from "@/lib/env";

import * as schema from "./schema";

export type Database = NodePgDatabase<typeof schema>;

export class DatabaseNotConfiguredError extends Error {
  constructor() {
    super("DATABASE_URL chưa được cấu hình. Xem .env.example và README.");
    this.name = "DatabaseNotConfiguredError";
  }
}

type DatabaseClient = { pool: Pool; db: Database };

// Reuse a single pool across hot reloads in development.
const globalForDb = globalThis as typeof globalThis & { __ocStudioDb?: DatabaseClient };

function getClient(): DatabaseClient {
  if (globalForDb.__ocStudioDb) return globalForDb.__ocStudioDb;

  const { DATABASE_URL } = getServerEnv();
  if (!DATABASE_URL) throw new DatabaseNotConfiguredError();

  const pool = new Pool({
    connectionString: DATABASE_URL,
    max: 10,
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 30_000,
  });
  const client = { pool, db: drizzle({ client: pool, schema }) };
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
