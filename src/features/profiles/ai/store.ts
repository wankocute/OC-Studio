import type { RichTextDocument } from "../domain";

import type { AiSnapshot } from "./facts";
import type { AiError } from "./provider";

/** What a preview froze: the section as the user saw it when consenting. */
export type AiEntryInput = {
  sectionId: string;
  draftRevision: number;
  title: string;
  groups: string[];
};

/** Consent: exactly the facts (`json`) the user agreed to send. */
export type AiPreview = {
  kind: "preview";
  expires: number;
  input: AiEntryInput;
  allow: string[];
  json: string;
  snapshot: AiSnapshot;
};

/** A suggestion the AI produced, waiting to be applied or discarded. */
export type AiCandidate = {
  kind: "candidate";
  expires: number;
  input: AiEntryInput;
  content: RichTextDocument;
  snapshot: AiSnapshot;
  json: string;
  allow: string[];
};

export type AiEntry = AiPreview | AiCandidate;

export type AiJobStatus = "queued" | "running" | "succeeded" | "failed" | "cancelled";

/** What the client sees of a background generation. Dates are ISO strings. */
export type AiJobView = {
  id: string;
  sectionId: string;
  title: string;
  /** Model fixed when the job was created (id and readable name). */
  model: { id: string; label: string };
  status: AiJobStatus;
  startedAt: string;
  /** When the server gives up waiting for the provider. */
  deadlineAt: string;
  finishedAt?: string;
  result?: {
    token: string;
    content: RichTextDocument;
    stale: boolean;
    draftRevision: number;
    /** The suggestion is kept until then (15 minutes after it was produced). */
    expiresAt: string;
  };
  error?: { code: AiError["code"]; message: string };
};

export type AiJobFinish = Pick<AiJobView, "result" | "error"> & {
  status: "succeeded" | "failed" | "cancelled";
  finishedAt: number;
  /** A finished job is forgotten after this time. */
  expires: number;
};

/**
 * Where previews, suggestions and jobs live. Production uses Postgres
 * (`server/ai-job-store.ts`) so any serverless instance can read what another one wrote; every
 * time is passed in so expiry behaves the same in tests. Only queued/running jobs count as active.
 */
export interface AiStore {
  /** Throws `AiError("busy")` when `limit` unexpired entries already exist. */
  putEntry(token: string, entry: AiEntry, now: number, limit: number): Promise<void>;
  /** The entry if it exists and has not expired. */
  getEntry(token: string, now: number): Promise<AiEntry | null>;
  /** Remove and return the unexpired entry, atomically (a preview is consumed once). */
  takeEntry(token: string, now: number): Promise<AiEntry | null>;
  deleteEntry(token: string): Promise<void>;

  /**
   * Insert a queued job unless the section already has an active one, atomically.
   * Throws `AiError("busy")` when `limit` jobs are already stored.
   */
  insertJob(
    job: AiJobView,
    limit: number,
  ): Promise<{ inserted: true } | { inserted: false; active: AiJobView }>;
  /** The job unless it finished and expired. */
  getJob(id: string, now: number): Promise<AiJobView | null>;
  activeJob(sectionId: string): Promise<AiJobView | null>;
  /** Latest unexpired job of each listed section. */
  latestJobs(sectionIds: readonly string[], now: number): Promise<AiJobView[]>;
  /** queued → running; no-op otherwise. */
  markRunning(id: string): Promise<void>;
  /** Finish an active job. Returns `null` (and changes nothing) if it was no longer active. */
  finishJob(id: string, finish: AiJobFinish): Promise<AiJobView | null>;
  /** Delete a finished job (never an active one); returns its suggestion token, if any. */
  deleteFinishedJob(id: string): Promise<{ resultToken?: string } | null>;
  deleteJobsWithResult(token: string): Promise<void>;
  /**
   * Fail every active job whose deadline passed before `overdueBefore` — the instance running it
   * was stopped (deploy, crash, platform time limit), so nothing else will ever finish it.
   */
  failOverdue(overdueBefore: number, finish: Omit<AiJobFinish, "status">): Promise<void>;
  /** Delete expired entries and expired finished jobs. */
  prune(now: number): Promise<void>;
}
