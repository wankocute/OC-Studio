import "server-only";

import { sql } from "drizzle-orm";

import { InvalidServerEnvError } from "@/lib/env";

import { describeDatabaseError, describeReason, type DatabaseErrorReason } from "./errors";
import { DatabaseNotConfiguredError, getDb } from "./index";

export type DatabaseHealth =
  | { status: "connected"; database: string; serverVersion: string; latencyMs: number }
  | { status: "not_configured" }
  | { status: "error"; reason: DatabaseErrorReason; message: string };

/** Run a trivial read-only query to verify PostgreSQL connectivity. Never throws. */
export async function checkDatabaseHealth(): Promise<DatabaseHealth> {
  const startedAt = performance.now();
  try {
    const result = await getDb().execute<{ database: string; server_version: string }>(
      sql`select current_database() as database, current_setting('server_version') as server_version`,
    );
    const row = result.rows[0];
    return {
      status: "connected",
      database: row?.database ?? "unknown",
      serverVersion: row?.server_version ?? "unknown",
      latencyMs: Math.round(performance.now() - startedAt),
    };
  } catch (error) {
    if (error instanceof DatabaseNotConfiguredError) return { status: "not_configured" };
    if (error instanceof InvalidServerEnvError) {
      return { status: "error", ...describeReason("invalid_config") };
    }
    return { status: "error", ...describeDatabaseError(error) };
  }
}
