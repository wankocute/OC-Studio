import "server-only";
import { randomUUID } from "node:crypto";
import type { CharacterFacts, DefinitionContext } from "@/features/characters/domain";
import { canonicalJson } from "@/features/characters/domain";
import { AI_LIMITS } from "./constants";
import { describeAiError } from "./describe-error";
import { logAiRequest } from "./transport";
import { selectSectionFacts, type AiSnapshot } from "./facts";
import { AiError, parseAiOutput, type SectionWriter } from "./provider";
import type { RichTextDocument } from "../domain";

export type AiContext = {
  sectionId: string;
  draftRevision: number;
  facts: CharacterFacts;
  context: DefinitionContext;
  groups: string[];
  title: string;
};
type Preview = {
  kind: "preview";
  expires: number;
  input: Pick<AiContext, "sectionId" | "draftRevision" | "title" | "groups">;
  allow: string[];
  json: string;
  snapshot: AiSnapshot;
};
type Candidate = {
  kind: "candidate";
  expires: number;
  input: Preview["input"];
  content: RichTextDocument;
  snapshot: AiSnapshot;
  json: string;
  allow: string[];
};

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

type Job = {
  view: AiJobView;
  controller: AbortController;
  /** Finished jobs are forgotten after this time; active jobs never are. */
  expires: number;
  done: Promise<void>;
};

const isActive = (job: Job) => job.view.status === "queued" || job.view.status === "running";

/**
 * Section AI: previews (consent), background generations (jobs) and suggestions (candidates),
 * all in memory. Nothing survives a server restart: the client treats an unknown job as lost.
 */
export function createAiService() {
  const entries = new Map<string, Preview | Candidate>();
  const jobs = new Map<string, Job>();

  function prune() {
    const now = Date.now();
    for (const [key, entry] of entries) if (entry.expires <= now) entries.delete(key);
    for (const [key, job] of jobs) if (!isActive(job) && job.expires <= now) jobs.delete(key);
  }
  function put(value: Preview | Candidate) {
    prune();
    if (entries.size >= AI_LIMITS.entries) throw new AiError("busy");
    const token = randomUUID();
    entries.set(token, value);
    return token;
  }
  function get(token: string) {
    const entry = entries.get(token);
    if (!entry || entry.expires <= Date.now()) {
      entries.delete(token);
      throw new AiError("expired");
    }
    return entry;
  }
  function activeJobFor(sectionId: string) {
    return [...jobs.values()].find((job) => job.view.sectionId === sectionId && isActive(job));
  }
  function finish(job: Job, update: Partial<AiJobView>) {
    // A cancelled job ignores whatever the provider returns later.
    if (!isActive(job)) return;
    const now = Date.now();
    job.view = { ...job.view, ...update, finishedAt: new Date(now).toISOString() };
    job.expires = now + AI_LIMITS.jobTtlMs;
  }

  async function run(
    job: Job,
    entry: Preview,
    instruction: string,
    title: string,
    writer: SectionWriter,
    load: (sectionId: string) => Promise<AiContext>,
    timeoutMs: number,
  ) {
    const startedAt = Date.now();
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      job.view = { ...job.view, status: "running" };
      // Only the facts the user consented to (frozen in the preview) are sent.
      const output = await Promise.race([
        writer.generate(
          entry.json,
          JSON.stringify({ sectionTitle: title, request: instruction }),
          job.controller.signal,
        ),
        new Promise<never>((_, reject) => {
          timeout = setTimeout(() => {
            logAiRequest("timeout", startedAt, { stage: "watchdog", errorName: "TimeoutError" });
            job.controller.abort(new DOMException("AI deadline exceeded", "TimeoutError"));
            reject(new AiError("timeout"));
          }, timeoutMs);
        }),
      ]).finally(() => clearTimeout(timeout));
      if (!isActive(job)) return;
      const content = parseAiOutput(output);
      // Read (never sent anywhere) only to warn when facts changed while the AI was writing.
      const latest = await load(entry.input.sectionId);
      const stale =
        selectSectionFacts(latest.facts, latest.context, latest.groups, entry.allow).json !==
          entry.json || latest.title !== entry.input.title;
      const expires = Date.now() + AI_LIMITS.ttlMs;
      const token = put({
        kind: "candidate",
        expires,
        input: entry.input,
        content,
        snapshot: entry.snapshot,
        json: entry.json,
        allow: entry.allow,
      });
      finish(job, {
        status: "succeeded",
        result: {
          token,
          content,
          stale,
          draftRevision: entry.input.draftRevision,
          expiresAt: new Date(expires).toISOString(),
        },
      });
    } catch (error) {
      const failure = error instanceof AiError ? error : new AiError("unexpected");
      if (!(error instanceof AiError)) console.error("[profile-ai] job failed", error);
      finish(job, {
        status: "failed",
        error: { code: failure.code, message: describeAiError(failure) },
      });
    }
  }

  const service = {
    preview(input: AiContext, allow: string[]) {
      const selected = selectSectionFacts(input.facts, input.context, input.groups, allow);
      if (selected.json.length > AI_LIMITS.inputChars) throw new AiError("limit");
      const token = put({
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
     * in progress gets that job back — the provider is never called twice for one section.
     */
    async start(
      token: string,
      instruction: string,
      writer: SectionWriter,
      load: (sectionId: string) => Promise<AiContext>,
      options: { timeoutMs?: number; model?: { id: string; label: string } } = {},
    ): Promise<AiJobView> {
      const entry = get(token);
      if (entry.kind !== "preview") throw new AiError("expired");
      const existing = activeJobFor(entry.input.sectionId);
      if (existing) {
        entries.delete(token);
        return existing.view;
      }
      entries.delete(token); // Consent is consumed even when the provider fails.
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
      // Another start for this section may have won while the facts were being read.
      const raced = activeJobFor(entry.input.sectionId);
      if (raced) return raced.view;

      prune();
      if (jobs.size >= AI_LIMITS.jobs) throw new AiError("busy");
      const timeoutMs = options.timeoutMs ?? AI_LIMITS.timeoutMs;
      const now = Date.now();
      const job: Job = {
        view: {
          id: randomUUID(),
          sectionId: entry.input.sectionId,
          title: current.title,
          model: options.model ?? { id: "default", label: "default" },
          status: "queued",
          startedAt: new Date(now).toISOString(),
          deadlineAt: new Date(now + timeoutMs).toISOString(),
        },
        controller: new AbortController(),
        expires: Number.POSITIVE_INFINITY,
        done: Promise.resolve(),
      };
      jobs.set(job.view.id, job);
      job.done = run(job, entry, instruction, current.title, writer, load, timeoutMs);
      return job.view;
    },

    /** Current state of a job, or `null` if the server does not know it (restart, expired). */
    job(id: string): AiJobView | null {
      prune();
      return jobs.get(id)?.view ?? null;
    },

    /** The latest job of each section that still has one (to restore the UI on reload). */
    jobsForSections(sectionIds: readonly string[]): AiJobView[] {
      prune();
      const wanted = new Set(sectionIds);
      const latest = new Map<string, AiJobView>();
      for (const { view } of jobs.values()) {
        if (!wanted.has(view.sectionId)) continue;
        const previous = latest.get(view.sectionId);
        if (!previous || previous.startedAt <= view.startedAt) latest.set(view.sectionId, view);
      }
      return [...latest.values()];
    },

    /** Stop waiting for the provider. Aborting the request cannot guarantee Google stopped. */
    cancel(id: string): AiJobView | null {
      const job = jobs.get(id);
      if (!job) return null;
      if (isActive(job)) {
        job.controller.abort(new DOMException("Cancelled by the user", "AbortError"));
        finish(job, {
          status: "cancelled",
          error: { code: "cancelled", message: describeAiError(new AiError("cancelled")) },
        });
      }
      return job.view;
    },

    /** Forget a finished job and its suggestion. */
    dismiss(id: string) {
      const job = jobs.get(id);
      if (!job || isActive(job)) return;
      if (job.view.result) entries.delete(job.view.result.token);
      jobs.delete(id);
    },

    /** Resolves when the job has finished (tests, and callers that want to wait). */
    async wait(id: string) {
      await jobs.get(id)?.done;
      return service.job(id);
    },

    /** Start and wait: the candidate, or the job's error thrown as an `AiError`. */
    async generate(
      token: string,
      instruction: string,
      writer: SectionWriter,
      load: (sectionId: string) => Promise<AiContext>,
      options: { timeoutMs?: number; model?: { id: string; label: string } } = {},
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
      const entry = get(token);
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
      service.discard(token);
      return { ...saved, content: entry.content, stale };
    },

    /** Drop a preview or suggestion, and the finished job that produced it. */
    discard(token: string) {
      entries.delete(token);
      for (const [id, job] of jobs) if (job.view.result?.token === token) jobs.delete(id);
    },
  };
  return service;
}

// Survives HMR; bounded and ephemeral, deliberately not a generation archive. The key changed
// with background jobs so a dev server never keeps an instance of the previous shape.
const globalAi = globalThis as typeof globalThis & {
  ocSectionAiJobs?: ReturnType<typeof createAiService>;
};
export const sectionAi = (globalAi.ocSectionAiJobs ??= createAiService());
