import "server-only";
import { randomUUID } from "node:crypto";
import type { CharacterFacts, DefinitionContext } from "@/features/characters/domain";
import { canonicalJson } from "@/features/characters/domain";
import { AI_LIMITS } from "./constants";
import { describeAiError } from "./describe-error";
import { logAiRequest } from "./transport";
import { selectSectionFacts, type AiSnapshot } from "./facts";
import { AiError, parseAiOutput, type SectionWriter } from "./provider";
import type { AiCandidate, AiEntry, AiJobView, AiPreview, AiStore } from "./store";
import type { RichTextDocument } from "../domain";

export type { AiJobStatus, AiJobView } from "./store";

export type AiContext = {
  sectionId: string;
  draftRevision: number;
  facts: CharacterFacts;
  context: DefinitionContext;
  groups: string[];
  title: string;
};

/** Runs a background task after the response (Next's `after()` in production). */
export type Schedule = (task: () => Promise<void>) => void;

type StartOptions = {
  timeoutMs?: number;
  model?: { id: string; label: string };
  schedule?: Schedule;
};

const isActive = (job: Pick<AiJobView, "status">) =>
  job.status === "queued" || job.status === "running";

/**
 * Section AI: previews (consent), background generations (jobs) and suggestions (candidates).
 * State lives in `store` (Postgres in production), so whichever instance serves the next request
 * sees it. A job runs in the instance that started it, within that request's time budget; if that
 * instance stops, the job is marked failed once its deadline (plus a grace period) has passed.
 */
export function createAiService(store: AiStore) {
  /** Requests running in this instance, so a cancel arriving here aborts at once. */
  const controllers = new Map<string, AbortController>();
  /** Background runs started by this instance (tests and `generate` wait on them). */
  const runs = new Map<string, Promise<void>>();

  async function put(entry: AiEntry) {
    const now = Date.now();
    await store.prune(now);
    const token = randomUUID();
    await store.putEntry(token, entry, now, AI_LIMITS.entries);
    return token;
  }
  async function get(token: string) {
    const entry = await store.getEntry(token, Date.now());
    if (!entry) throw new AiError("expired");
    return entry;
  }
  async function finish(
    id: string,
    update: Pick<AiJobView, "result" | "error"> & {
      status: "succeeded" | "failed" | "cancelled";
    },
  ) {
    // A cancelled (or overdue) job ignores whatever the provider returns later.
    const now = Date.now();
    return store.finishJob(id, { ...update, finishedAt: now, expires: now + AI_LIMITS.jobTtlMs });
  }
  /** Jobs whose instance stopped can never finish on their own: fail them for the UI. */
  async function sweep() {
    const now = Date.now();
    await store.failOverdue(now - AI_LIMITS.deadlineGraceMs, {
      error: { code: "lost", message: describeAiError(new AiError("lost")) },
      finishedAt: now,
      expires: now + AI_LIMITS.jobTtlMs,
    });
    await store.prune(now);
  }

  async function run(
    job: AiJobView,
    entry: AiPreview,
    instruction: string,
    title: string,
    writer: SectionWriter,
    load: (sectionId: string) => Promise<AiContext>,
    timeoutMs: number,
  ) {
    const controller = new AbortController();
    controllers.set(job.id, controller);
    const startedAt = Date.now();
    let timeout: ReturnType<typeof setTimeout> | undefined;
    let watch: ReturnType<typeof setInterval> | undefined;
    try {
      await store.markRunning(job.id);
      // A cancel may be handled by another instance: notice it and stop waiting for Google.
      watch = setInterval(() => {
        void store.getJob(job.id, Date.now()).then(
          (current) => {
            if (current && !isActive(current))
              controller.abort(new DOMException("Cancelled by the user", "AbortError"));
          },
          () => {},
        );
      }, AI_LIMITS.cancelCheckMs);
      // Only the facts the user consented to (frozen in the preview) are sent.
      const output = await Promise.race([
        writer.generate(
          entry.json,
          JSON.stringify({ sectionTitle: title, request: instruction }),
          controller.signal,
        ),
        new Promise<never>((_, reject) => {
          timeout = setTimeout(() => {
            logAiRequest("timeout", startedAt, { stage: "watchdog", errorName: "TimeoutError" });
            controller.abort(new DOMException("AI deadline exceeded", "TimeoutError"));
            reject(new AiError("timeout"));
          }, timeoutMs);
        }),
      ]).finally(() => {
        clearTimeout(timeout);
        clearInterval(watch);
      });
      if (controller.signal.aborted) return;
      const content = parseAiOutput(output);
      // Read (never sent anywhere) only to warn when facts changed while the AI was writing.
      const latest = await load(entry.input.sectionId);
      const stale =
        selectSectionFacts(latest.facts, latest.context, latest.groups, entry.allow).json !==
          entry.json || latest.title !== entry.input.title;
      const expires = Date.now() + AI_LIMITS.ttlMs;
      const candidate: AiCandidate = {
        kind: "candidate",
        expires,
        input: entry.input,
        content,
        snapshot: entry.snapshot,
        json: entry.json,
        allow: entry.allow,
      };
      const token = await put(candidate);
      const finished = await finish(job.id, {
        status: "succeeded",
        result: {
          token,
          content,
          stale,
          draftRevision: entry.input.draftRevision,
          expiresAt: new Date(expires).toISOString(),
        },
      });
      // Cancelled meanwhile: the suggestion must not outlive the job that nobody wants.
      if (!finished) await store.deleteEntry(token);
    } catch (error) {
      clearInterval(watch);
      const failure = error instanceof AiError ? error : new AiError("unexpected");
      if (!(error instanceof AiError)) console.error("[profile-ai] job failed", error);
      await finish(job.id, {
        status: "failed",
        error: { code: failure.code, message: describeAiError(failure) },
      }).catch((storeError: unknown) => {
        // The deadline sweep will still mark it failed for the UI.
        console.error("[profile-ai] could not record job failure", storeError);
      });
    } finally {
      controllers.delete(job.id);
    }
  }

  const service = {
    async preview(input: AiContext, allow: string[]) {
      const selected = selectSectionFacts(input.facts, input.context, input.groups, allow);
      if (selected.json.length > AI_LIMITS.inputChars) throw new AiError("limit");
      const token = await put({
        kind: "preview",
        expires: Date.now() + AI_LIMITS.ttlMs,
        input: {
          sectionId: input.sectionId,
          draftRevision: input.draftRevision,
          title: input.title,
          groups: [...input.groups],
        },
        allow,
        json: selected.json,
        snapshot: selected.snapshot,
      });
      return {
        token,
        json: selected.json,
        permissions: selected.permissions,
        empty: Object.keys(selected.payload.values).length === 0,
        draftRevision: input.draftRevision,
      };
    },

    /**
     * Start a background generation from a preview and return at once. Checks that need the
     * database run first (no transaction is held while the provider works). A section with a job
     * in progress gets that job back — the provider is never called twice for one section
     * (enforced by the store, so it holds across instances too).
     */
    async start(
      token: string,
      instruction: string,
      writer: SectionWriter,
      load: (sectionId: string) => Promise<AiContext>,
      options: StartOptions = {},
    ): Promise<AiJobView> {
      await sweep();
      // Consent is consumed even when the provider fails.
      const entry = await store.takeEntry(token, Date.now());
      if (!entry || entry.kind !== "preview") throw new AiError("expired");
      const existing = await store.activeJob(entry.input.sectionId);
      if (existing) return existing;
      if (instruction.length > AI_LIMITS.instructionChars) throw new AiError("limit");
      const current = await load(entry.input.sectionId);
      const selected = selectSectionFacts(
        current.facts,
        current.context,
        current.groups,
        entry.allow,
      );
      if (
        selected.json !== entry.json ||
        current.title !== entry.input.title ||
        canonicalJson(current.groups) !== canonicalJson(entry.input.groups)
      )
        throw new AiError("changed");
      if (Object.keys(selected.payload.values).length === 0) throw new AiError("empty");

      const timeoutMs = options.timeoutMs ?? AI_LIMITS.timeoutMs;
      const now = Date.now();
      const job: AiJobView = {
        id: randomUUID(),
        sectionId: entry.input.sectionId,
        title: current.title,
        model: options.model ?? { id: "default", label: "default" },
        status: "queued",
        startedAt: new Date(now).toISOString(),
        deadlineAt: new Date(now + timeoutMs).toISOString(),
      };
      // Another start for this section may have won while the facts were being read.
      const inserted = await store.insertJob(job, AI_LIMITS.jobs);
      if (!inserted.inserted) return inserted.active;

      let release!: () => void;
      const done = new Promise<void>((resolve) => (release = resolve));
      runs.set(job.id, done);
      const task = () =>
        run(job, entry, instruction, current.title, writer, load, timeoutMs).finally(() => {
          runs.delete(job.id);
          release();
        });
      (options.schedule ?? ((work) => void work()))(task);
      return job;
    },

    /** Current state of a job, or `null` if it is unknown (expired, dismissed). */
    async job(id: string): Promise<AiJobView | null> {
      await sweep();
      return store.getJob(id, Date.now());
    },

    /** The latest job of each section that still has one (to restore the UI on reload). */
    async jobsForSections(sectionIds: readonly string[]): Promise<AiJobView[]> {
      if (sectionIds.length === 0) return [];
      await sweep();
      return store.latestJobs(sectionIds, Date.now());
    },

    /** Stop waiting for the provider. Aborting the request cannot guarantee Google stopped. */
    async cancel(id: string): Promise<AiJobView | null> {
      const cancelled = await finish(id, {
        status: "cancelled",
        error: { code: "cancelled", message: describeAiError(new AiError("cancelled")) },
      });
      // Running here: abort now. Elsewhere, that instance notices within `cancelCheckMs`.
      controllers.get(id)?.abort(new DOMException("Cancelled by the user", "AbortError"));
      return cancelled ?? store.getJob(id, Date.now());
    },

    /** Forget a finished job and its suggestion. */
    async dismiss(id: string) {
      const deleted = await store.deleteFinishedJob(id);
      if (deleted?.resultToken) await store.deleteEntry(deleted.resultToken);
    },

    /** Resolves when a job started by this instance has finished (tests, `generate`). */
    async wait(id: string) {
      await runs.get(id);
      return service.job(id);
    },

    /** Start and wait: the candidate, or the job's error thrown as an `AiError`. */
    async generate(
      token: string,
      instruction: string,
      writer: SectionWriter,
      load: (sectionId: string) => Promise<AiContext>,
      options: StartOptions = {},
    ) {
      const started = await service.start(token, instruction, writer, load, options);
      const job = await service.wait(started.id);
      if (job?.status === "succeeded" && job.result) return job.result;
      throw new AiError(job?.error?.code ?? "lost");
    },

    async apply(
      token: string,
      confirmStale: boolean,
      load: (sectionId: string) => Promise<AiContext>,
      write: (candidate: {
        sectionId: string;
        draftRevision: number;
        content: RichTextDocument;
        snapshot: AiSnapshot;
      }) => Promise<{ draftRevision: number; savedAt: string }>,
    ) {
      const entry = await get(token);
      if (entry.kind !== "candidate") throw new AiError("expired");
      const latest = await load(entry.input.sectionId);
      const stale =
        selectSectionFacts(latest.facts, latest.context, latest.groups, entry.allow).json !==
          entry.json || latest.title !== entry.input.title;
      if (stale && !confirmStale) throw new AiError("stale");
      const saved = await write({
        sectionId: entry.input.sectionId,
        draftRevision: entry.input.draftRevision,
        content: entry.content,
        snapshot: entry.snapshot,
      });
      await service.discard(token);
      return { ...saved, content: entry.content, stale };
    },

    /** Drop a preview or suggestion, and the finished job that produced it. */
    async discard(token: string) {
      await store.deleteEntry(token);
      await store.deleteJobsWithResult(token);
    },
  };
  return service;
}

export type AiService = ReturnType<typeof createAiService>;
