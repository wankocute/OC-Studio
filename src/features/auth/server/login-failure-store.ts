import "server-only";

import { inArray, lte, sql } from "drizzle-orm";

import type { Database } from "@/db";
import { guard } from "@/db/repository-errors";
import { loginFailures } from "@/db/schema";

import type { FailureBucket, LoginFailureStore } from "../rate-limit";

/** Failed-login counters in Postgres, shared by every serverless instance. */
export function createLoginFailureStore(db: Database): LoginFailureStore {
  return {
    read: (keys) =>
      guard(async () => {
        const rows = await db
          .select()
          .from(loginFailures)
          .where(inArray(loginFailures.clientKey, [...keys]));
        return new Map<string, FailureBucket>(
          rows.map((row) => [
            row.clientKey,
            { failures: row.failures, windowStart: row.windowStart.getTime() },
          ]),
        );
      }),

    increment: (keys, now, windowMs) =>
      guard(async () => {
        const start = new Date(now);
        const cutoff = new Date(now - windowMs);
        // One statement per call: concurrent failures each add exactly one (row lock on conflict).
        await db
          .insert(loginFailures)
          .values(keys.map((clientKey) => ({ clientKey, windowStart: start, failures: 1 })))
          .onConflictDoUpdate({
            target: loginFailures.clientKey,
            set: {
              failures: sql`case when ${loginFailures.windowStart} <= ${cutoff} then 1 else ${loginFailures.failures} + 1 end`,
              windowStart: sql`case when ${loginFailures.windowStart} <= ${cutoff} then excluded.window_start else ${loginFailures.windowStart} end`,
            },
          });
      }),

    remove: (key) =>
      guard(async () => {
        await db.delete(loginFailures).where(inArray(loginFailures.clientKey, [key]));
      }),

    prune: (before) =>
      guard(async () => {
        await db.delete(loginFailures).where(lte(loginFailures.windowStart, new Date(before)));
      }),
  };
}
