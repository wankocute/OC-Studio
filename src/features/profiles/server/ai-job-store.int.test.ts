import { describe, expect, it } from "vitest";

import { aiSectionJobs, aiSectionTokens } from "@/db/schema";
import { sampleMinimal } from "@/features/characters/__tests__/fixtures/sample-characters";
import { createCharacterRepository } from "@/features/characters/server/character-repository";
import { connectTestDatabase } from "@/test/integration-context";

import { type AiContext, createAiService } from "../ai/service";
import type { AiJobView, AiPreview } from "../ai/store";

import { createAiJobStore } from "./ai-job-store";
import { createProfileRepository } from "./profile-repository";

const { db } = connectTestDatabase();

async function section() {
  const character = await createCharacterRepository(db).create({
    ...sampleMinimal,
    displayName: "An",
  });
  const profile = await createProfileRepository(db).createPrimary(character.id);
  return profile.sections[0]!.id;
}

function context(sectionId: string): AiContext {
  return {
    sectionId,
    draftRevision: 1,
    title: "Tiểu sử",
    groups: ["background"],
    context: {},
    facts: {
      schemaVersion: 3,
      displayName: "An",
      values: { "background.birthplace": { state: "specified", value: "Huế" } },
    },
  };
}

function job(sectionId: string, overrides: Partial<AiJobView> = {}): AiJobView {
  const now = Date.now();
  return {
    id: crypto.randomUUID(),
    sectionId,
    title: "Tiểu sử",
    model: { id: "m", label: "M" },
    status: "queued",
    startedAt: new Date(now).toISOString(),
    deadlineAt: new Date(now + 60_000).toISOString(),
    ...overrides,
  };
}

describe("AI job store (Postgres)", () => {
  it("runs a whole job and lets a second instance read, apply and see it disappear", async () => {
    const sectionId = await section();
    const input = context(sectionId);
    const starter = createAiService(createAiJobStore(db));
    const other = createAiService(createAiJobStore(db));
    const preview = await starter.preview(input);
    const started = await starter.start(
      preview.token,
      "",
      { generate: async () => ({ paragraphs: ["An sinh tại Huế."] }) },
      async () => input,
      { model: { id: "gemini-x", label: "Gemini X" } },
    );
    await starter.wait(started.id);
    const done = await other.job(started.id);
    expect(done).toMatchObject({
      status: "succeeded",
      model: { id: "gemini-x", label: "Gemini X" },
      result: { draftRevision: 1, stale: false },
    });
    expect((await other.jobsForSections([sectionId])).map((view) => view.id)).toEqual([started.id]);
    await other.discard(done!.result!.token);
    expect(await starter.job(started.id)).toBeNull();
    expect(await db.select().from(aiSectionTokens)).toEqual([]);
  });

  it("allows only one active job per section, atomically", async () => {
    const sectionId = await section();
    const store = createAiJobStore(db);
    const results = await Promise.all(
      Array.from({ length: 5 }, () => store.insertJob(job(sectionId), 200)),
    );
    expect(results.filter((result) => result.inserted)).toHaveLength(1);
    expect(await db.select().from(aiSectionJobs)).toHaveLength(1);
  });

  it("finishes a job only while it is active (a cancel wins over a late result)", async () => {
    const sectionId = await section();
    const store = createAiJobStore(db);
    const view = job(sectionId);
    await store.insertJob(view, 200);
    await store.markRunning(view.id);
    const now = Date.now();
    const cancelled = await store.finishJob(view.id, {
      status: "cancelled",
      finishedAt: now,
      expires: now + 60_000,
      error: { code: "cancelled", message: "Đã hủy" },
    });
    expect(cancelled).toMatchObject({ status: "cancelled", error: { code: "cancelled" } });
    expect(
      await store.finishJob(view.id, { status: "succeeded", finishedAt: now, expires: now + 1 }),
    ).toBeNull();
  });

  it("fails jobs stuck past their deadline and prunes expired rows", async () => {
    const sectionId = await section();
    const store = createAiJobStore(db);
    const now = Date.now();
    const stuck = job(sectionId, {
      status: "running",
      startedAt: new Date(now - 400_000).toISOString(),
      deadlineAt: new Date(now - 100_000).toISOString(),
    });
    await store.insertJob(stuck, 200);
    await store.failOverdue(now - 30_000, {
      finishedAt: now,
      expires: now + 1_000,
      error: { code: "lost", message: "lost" },
    });
    expect(await store.getJob(stuck.id, now)).toMatchObject({
      status: "failed",
      error: { code: "lost" },
    });
    // The section can start again; the failed job expires and is pruned.
    expect((await store.insertJob(job(sectionId), 200)).inserted).toBe(true);
    await store.prune(now + 2_000);
    expect(await store.getJob(stuck.id, now)).toBeNull();
  });

  it("consumes a preview only once and hides expired entries", async () => {
    const sectionId = await section();
    const store = createAiJobStore(db);
    const now = Date.now();
    const entry: AiPreview = {
      kind: "preview",
      expires: now + 60_000,
      input: { sectionId, draftRevision: 1, title: "T", groups: [] },
      json: "{}",
      snapshot: { scope: [], fingerprints: {} } as unknown as AiPreview["snapshot"],
    };
    const first = "00000000-0000-4000-8000-000000000001";
    await store.putEntry(first, entry, now, 100);
    const taken = await Promise.all([store.takeEntry(first, now), store.takeEntry(first, now)]);
    expect(taken.filter(Boolean)).toHaveLength(1);

    const second = "00000000-0000-4000-8000-000000000002";
    await store.putEntry(second, entry, now, 100);
    expect(await store.getEntry(second, now + 60_000)).toBeNull();
  });
});
