"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { getSectionAiJobsAction } from "@/features/profiles/ai/actions";
import type { AiJobView } from "@/features/profiles/ai/service";
import { messages } from "@/i18n";

import { markForTyping } from "./rich-text-typing";

/** How often active jobs are checked. Each check only reads the database. */
export const AI_POLL_INTERVAL_MS = 3_000;
/** After the server's deadline, a job still reported as running is treated as lost. */
const DEADLINE_GRACE_MS = 60_000;

export const isActiveJob = (job: AiJobView | undefined) =>
  job?.status === "queued" || job?.status === "running";

/** A job the server no longer knows (restart, expiry): shown as failed, never as running. */
export function lostJob(job: AiJobView): AiJobView {
  return {
    ...job,
    status: "failed",
    finishedAt: new Date().toISOString(),
    error: { code: "lost", message: messages.profileAi.errors.lost },
  };
}

/**
 * AI jobs of a profile, by section. Active jobs are polled (bounded by their deadline) until they
 * finish; `onFinished` fires once per job that finishes while the page is open.
 */
export function useAiJobs(
  initial: readonly AiJobView[],
  onFinished: (job: AiJobView) => void,
): {
  jobs: Readonly<Record<string, AiJobView>>;
  track: (job: AiJobView) => void;
  forget: (sectionId: string) => void;
} {
  const [jobs, setJobs] = useState<Record<string, AiJobView>>(() =>
    Object.fromEntries(initial.map((job) => [job.sectionId, job])),
  );
  const finishedRef = useRef(onFinished);
  useEffect(() => {
    finishedRef.current = onFinished;
  }, [onFinished]);

  const activeIds = Object.values(jobs)
    .filter(isActiveJob)
    .map((job) => job.id)
    .sort()
    .join(",");

  useEffect(() => {
    if (!activeIds) return;
    let stopped = false;
    const timer = window.setTimeout(async () => {
      const ids = activeIds.split(",");
      let views: (AiJobView | null)[] | null = null;
      try {
        const result = await getSectionAiJobsAction(ids);
        if (result.ok) views = result.data;
      } catch {
        // Network hiccup: try again on the next tick (the deadline still bounds the wait).
      }
      if (stopped) return;
      const updates: AiJobView[] = [];
      for (const job of Object.values(jobs)) {
        const index = ids.indexOf(job.id);
        if (index === -1) continue;
        const fresh = views ? views[index] : job;
        const overdue = Date.parse(job.deadlineAt) + DEADLINE_GRACE_MS < Date.now();
        updates.push(
          fresh === null || (fresh && isActiveJob(fresh) && overdue) ? lostJob(job) : fresh!,
        );
      }
      // Replace a job only if it is still the one that was polled for its section. A new state
      // object also schedules the next check while jobs remain active.
      setJobs((current) => {
        const next = { ...current };
        for (const job of updates) {
          if (current[job.sectionId]?.id === job.id) next[job.sectionId] = job;
        }
        return next;
      });
      for (const job of updates) {
        if (isActiveJob(job)) continue;
        // Seen finishing live: its text is typed out the first time it is shown.
        if (job.status === "succeeded") markForTyping(job.id);
        finishedRef.current(job);
      }
    }, AI_POLL_INTERVAL_MS);
    return () => {
      stopped = true;
      window.clearTimeout(timer);
    };
  }, [activeIds, jobs]);

  const track = useCallback(
    (job: AiJobView) => setJobs((current) => ({ ...current, [job.sectionId]: job })),
    [],
  );
  const forget = useCallback(
    (sectionId: string) =>
      setJobs((current) => {
        const next = { ...current };
        delete next[sectionId];
        return next;
      }),
    [],
  );
  return { jobs, track, forget };
}
