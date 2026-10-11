import { AiError } from "@/features/profiles/ai/provider";
import type { AiEntry, AiJobFinish, AiJobView, AiStore } from "@/features/profiles/ai/store";

type StoredJob = { view: AiJobView; expires: number | null };

const isActive = (view: AiJobView) => view.status === "queued" || view.status === "running";

/**
 * Unit-test double of the Postgres AI store (`server/ai-job-store.ts`), same semantics, no
 * database. Copies values in and out like a database would, so tests cannot share references.
 */
export function createMemoryAiStore(): AiStore & { jobs: Map<string, StoredJob> } {
  const entries = new Map<string, AiEntry>();
  const jobs = new Map<string, StoredJob>();
  const copy = <T>(value: T): T => structuredClone(value);
  const visible = (job: StoredJob | undefined, now: number) =>
    job && (job.expires === null || job.expires > now) ? copy(job.view) : null;

  function apply(job: StoredJob, finish: AiJobFinish) {
    const { status, result, error, finishedAt, expires } = finish;
    const view: AiJobView = { ...job.view, status, finishedAt: new Date(finishedAt).toISOString() };
    if (result) view.result = copy(result);
    if (error) view.error = copy(error);
    job.view = view;
    job.expires = expires;
  }

  const store: AiStore & { jobs: Map<string, StoredJob> } = {
    jobs,
    async putEntry(token, entry, now, limit) {
      if ([...entries.values()].filter((e) => e.expires > now).length >= limit) {
        throw new AiError("busy");
      }
      entries.set(token, copy(entry));
    },
    async getEntry(token, now) {
      const entry = entries.get(token);
      return entry && entry.expires > now ? copy(entry) : null;
    },
    async takeEntry(token, now) {
      const entry = entries.get(token);
      entries.delete(token);
      return entry && entry.expires > now ? entry : null;
    },
    async deleteEntry(token) {
      entries.delete(token);
    },
    async insertJob(job, limit) {
      if (jobs.size >= limit) throw new AiError("busy");
      const active = [...jobs.values()].find(
        (stored) => stored.view.sectionId === job.sectionId && isActive(stored.view),
      );
      if (active) return { inserted: false, active: copy(active.view) };
      jobs.set(job.id, { view: copy(job), expires: null });
      return { inserted: true };
    },
    async getJob(id, now) {
      return visible(jobs.get(id), now);
    },
    async activeJob(sectionId) {
      const active = [...jobs.values()].find(
        (stored) => stored.view.sectionId === sectionId && isActive(stored.view),
      );
      return active ? copy(active.view) : null;
    },
    async latestJobs(sectionIds, now) {
      const latest = new Map<string, AiJobView>();
      for (const stored of jobs.values()) {
        const view = visible(stored, now);
        if (!view || !sectionIds.includes(view.sectionId)) continue;
        const previous = latest.get(view.sectionId);
        if (!previous || previous.startedAt <= view.startedAt) latest.set(view.sectionId, view);
      }
      return [...latest.values()];
    },
    async markRunning(id) {
      const job = jobs.get(id);
      if (job?.view.status === "queued") job.view = { ...job.view, status: "running" };
    },
    async finishJob(id, finish) {
      const job = jobs.get(id);
      if (!job || !isActive(job.view)) return null;
      apply(job, finish);
      return copy(job.view);
    },
    async deleteFinishedJob(id) {
      const job = jobs.get(id);
      if (!job || isActive(job.view)) return null;
      jobs.delete(id);
      return job.view.result ? { resultToken: job.view.result.token } : {};
    },
    async deleteJobsWithResult(token) {
      for (const [id, job] of jobs) if (job.view.result?.token === token) jobs.delete(id);
    },
    async failOverdue(overdueBefore, finish) {
      for (const job of jobs.values()) {
        if (isActive(job.view) && Date.parse(job.view.deadlineAt) < overdueBefore) {
          apply(job, { ...finish, status: "failed" });
        }
      }
    },
    async prune(now) {
      for (const [token, entry] of entries) if (entry.expires <= now) entries.delete(token);
      for (const [id, job] of jobs) if (job.expires !== null && job.expires <= now) jobs.delete(id);
    },
  };
  return store;
}
