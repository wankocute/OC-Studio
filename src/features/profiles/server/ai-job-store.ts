import "server-only";

import { and, count, desc, eq, gt, inArray, isNull, lt, lte, or, sql } from "drizzle-orm";

import type { Database } from "@/db";
import { guard } from "@/db/repository-errors";
import { aiSectionJobs, aiSectionTokens } from "@/db/schema";

import { AiError } from "../ai/provider";
import type { AiEntry, AiJobFinish, AiJobView, AiStore } from "../ai/store";

type JobRow = typeof aiSectionJobs.$inferSelect;

const ACTIVE = ["queued", "running"] as const;
const isActive = inArray(aiSectionJobs.status, [...ACTIVE]);
const notExpired = (now: number) =>
  or(isNull(aiSectionJobs.expiresAt), gt(aiSectionJobs.expiresAt, new Date(now)));

function toView(row: JobRow): AiJobView {
  return {
    id: row.id,
    sectionId: row.sectionId,
    title: row.title,
    model: { id: row.modelId, label: row.modelLabel },
    status: row.status as AiJobView["status"],
    startedAt: row.startedAt.toISOString(),
    deadlineAt: row.deadlineAt.toISOString(),
    ...(row.finishedAt ? { finishedAt: row.finishedAt.toISOString() } : {}),
    ...(row.result ? { result: row.result as AiJobView["result"] } : {}),
    ...(row.errorCode
      ? {
          error: {
            code: row.errorCode as NonNullable<AiJobView["error"]>["code"],
            message: row.errorMessage ?? "",
          },
        }
      : {}),
  };
}

function finishColumns(finish: Omit<AiJobFinish, "status">) {
  return {
    finishedAt: new Date(finish.finishedAt),
    expiresAt: new Date(finish.expires),
    result: (finish.result as Record<string, unknown> | undefined) ?? null,
    errorCode: finish.error?.code ?? null,
    errorMessage: finish.error?.message ?? null,
  };
}

/** Section AI state in Postgres (see `AiStore`). Rows are short-lived and pruned on use. */
export function createAiJobStore(db: Database): AiStore {
  const store: AiStore = {
    async putEntry(token, entry, now, limit) {
      const [row] = await guard(() =>
        db
          .select({ total: count() })
          .from(aiSectionTokens)
          .where(gt(aiSectionTokens.expiresAt, new Date(now))),
      );
      if ((row?.total ?? 0) >= limit) throw new AiError("busy");
      await guard(() =>
        db.insert(aiSectionTokens).values({
          id: token,
          sectionId: entry.input.sectionId,
          kind: entry.kind,
          payload: entry as unknown as Record<string, unknown>,
          expiresAt: new Date(entry.expires),
        }),
      );
    },

    getEntry: (token, now) =>
      guard(async () => {
        const [row] = await db
          .select({ payload: aiSectionTokens.payload })
          .from(aiSectionTokens)
          .where(and(eq(aiSectionTokens.id, token), gt(aiSectionTokens.expiresAt, new Date(now))));
        return row ? (row.payload as unknown as AiEntry) : null;
      }),

    takeEntry: (token, now) =>
      guard(async () => {
        // DELETE … RETURNING: of two concurrent starts, only one gets the preview.
        const [row] = await db
          .delete(aiSectionTokens)
          .where(eq(aiSectionTokens.id, token))
          .returning({ payload: aiSectionTokens.payload, expiresAt: aiSectionTokens.expiresAt });
        if (!row || row.expiresAt.getTime() <= now) return null;
        return row.payload as unknown as AiEntry;
      }),

    deleteEntry: (token) =>
      guard(async () => {
        await db.delete(aiSectionTokens).where(eq(aiSectionTokens.id, token));
      }),

    async insertJob(job, limit) {
      const [row] = await guard(() => db.select({ total: count() }).from(aiSectionJobs));
      if ((row?.total ?? 0) >= limit) throw new AiError("busy");
      // The partial unique index allows one active job per section; a race loses here.
      for (let attempt = 0; attempt < 3; attempt++) {
        const inserted = await guard(() =>
          db
            .insert(aiSectionJobs)
            .values({
              id: job.id,
              sectionId: job.sectionId,
              status: job.status,
              title: job.title,
              modelId: job.model.id,
              modelLabel: job.model.label,
              startedAt: new Date(job.startedAt),
              deadlineAt: new Date(job.deadlineAt),
            })
            .onConflictDoNothing()
            .returning({ id: aiSectionJobs.id }),
        );
        if (inserted.length > 0) return { inserted: true };
        const active = await store.activeJob(job.sectionId);
        if (active) return { inserted: false, active };
        // The active job finished in between: try again.
      }
      throw new AiError("busy");
    },

    getJob: (id, now) =>
      guard(async () => {
        const [row] = await db
          .select()
          .from(aiSectionJobs)
          .where(and(eq(aiSectionJobs.id, id), notExpired(now)));
        return row ? toView(row) : null;
      }),

    activeJob: (sectionId) =>
      guard(async () => {
        const [row] = await db
          .select()
          .from(aiSectionJobs)
          .where(and(eq(aiSectionJobs.sectionId, sectionId), isActive));
        return row ? toView(row) : null;
      }),

    latestJobs: (sectionIds, now) =>
      guard(async () => {
        const rows = await db
          .selectDistinctOn([aiSectionJobs.sectionId])
          .from(aiSectionJobs)
          .where(and(inArray(aiSectionJobs.sectionId, [...sectionIds]), notExpired(now)))
          .orderBy(aiSectionJobs.sectionId, desc(aiSectionJobs.startedAt));
        return rows.map(toView);
      }),

    markRunning: (id) =>
      guard(async () => {
        await db
          .update(aiSectionJobs)
          .set({ status: "running" })
          .where(and(eq(aiSectionJobs.id, id), eq(aiSectionJobs.status, "queued")));
      }),

    finishJob: (id, finish) =>
      guard(async () => {
        const [row] = await db
          .update(aiSectionJobs)
          .set({ status: finish.status, ...finishColumns(finish) })
          .where(and(eq(aiSectionJobs.id, id), isActive))
          .returning();
        return row ? toView(row) : null;
      }),

    deleteFinishedJob: (id) =>
      guard(async () => {
        const [row] = await db
          .delete(aiSectionJobs)
          .where(and(eq(aiSectionJobs.id, id), sql`not ${isActive}`))
          .returning({ result: aiSectionJobs.result });
        if (!row) return null;
        const token = (row.result as { token?: unknown } | null)?.token;
        return typeof token === "string" ? { resultToken: token } : {};
      }),

    deleteJobsWithResult: (token) =>
      guard(async () => {
        await db.delete(aiSectionJobs).where(sql`${aiSectionJobs.result} ->> 'token' = ${token}`);
      }),

    failOverdue: (overdueBefore, finish) =>
      guard(async () => {
        await db
          .update(aiSectionJobs)
          .set({ status: "failed", ...finishColumns(finish) })
          .where(and(isActive, lt(aiSectionJobs.deadlineAt, new Date(overdueBefore))));
      }),

    prune: (now) =>
      guard(async () => {
        const cutoff = new Date(now);
        await db.delete(aiSectionTokens).where(lte(aiSectionTokens.expiresAt, cutoff));
        await db.delete(aiSectionJobs).where(lte(aiSectionJobs.expiresAt, cutoff));
      }),
  };
  return store;
}
