import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { profileSections } from "./profiles";

/**
 * Short-lived server state that used to live in process memory. On a serverless host every
 * request may run in a different instance, so it is kept here instead. Rows expire on their own
 * (`expires_at` / `window_start`) and are pruned by the code that writes them; none of it is
 * user content worth backing up.
 */

/**
 * Failed logins in fixed windows, per client (`ip:<address>`) and in total (`*`).
 * A success deletes the client's row; stale rows are pruned on the next failure.
 */
export const loginFailures = pgTable(
  "login_failures",
  {
    clientKey: text("client_key").primaryKey(),
    windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
    failures: integer("failures").notNull(),
  },
  (t) => [
    check(
      "login_failures_key_valid",
      sql`${t.clientKey} <> '' and char_length(${t.clientKey}) <= 120`,
    ),
    check("login_failures_count_positive", sql`${t.failures} >= 1`),
    index("login_failures_window_idx").on(t.windowStart),
  ],
);

export const AI_TOKEN_KINDS = ["preview", "candidate"] as const;
export const AI_JOB_STATUSES = ["queued", "running", "succeeded", "failed", "cancelled"] as const;

/**
 * Section AI consent previews and suggestions (`kind`), addressed by a random token.
 * `payload` holds exactly what the user saw and agreed to send (or what the AI returned);
 * it is deleted when used, discarded or expired (15 minutes).
 */
export const aiSectionTokens = pgTable(
  "ai_section_tokens",
  {
    id: uuid("id").primaryKey(),
    sectionId: uuid("section_id")
      .notNull()
      .references(() => profileSections.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("ai_section_tokens_kind_valid", sql`${t.kind} in ('preview', 'candidate')`),
    index("ai_section_tokens_expires_idx").on(t.expiresAt),
    index("ai_section_tokens_section_idx").on(t.sectionId),
  ],
);

/**
 * Background generations. At most one queued/running job per section (partial unique index), so
 * two requests can never call the provider twice for one section. Finished jobs are kept until
 * `expires_at` for the user to come back to; active jobs have no expiry but a `deadline_at`,
 * after which they are marked failed even if the instance running them was stopped.
 */
export const aiSectionJobs = pgTable(
  "ai_section_jobs",
  {
    id: uuid("id").primaryKey(),
    sectionId: uuid("section_id")
      .notNull()
      .references(() => profileSections.id, { onDelete: "cascade" }),
    status: text("status").notNull(),
    title: text("title").notNull(),
    modelId: text("model_id").notNull(),
    modelLabel: text("model_label").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    deadlineAt: timestamp("deadline_at", { withTimezone: true }).notNull(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    /** `AiJobView["result"]` once succeeded (token of the suggestion + content). */
    result: jsonb("result").$type<Record<string, unknown>>(),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
  },
  (t) => [
    check(
      "ai_section_jobs_status_valid",
      sql`${t.status} in ('queued', 'running', 'succeeded', 'failed', 'cancelled')`,
    ),
    check(
      "ai_section_jobs_finished_consistent",
      sql`(${t.status} in ('queued', 'running')) = (${t.finishedAt} is null and ${t.expiresAt} is null)`,
    ),
    uniqueIndex("ai_section_jobs_one_active_idx")
      .on(t.sectionId)
      .where(sql`${t.status} in ('queued', 'running')`),
    index("ai_section_jobs_section_started_idx").on(t.sectionId, t.startedAt),
    index("ai_section_jobs_expires_idx").on(t.expiresAt),
  ],
);
