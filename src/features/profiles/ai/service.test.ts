import { describe, expect, it, vi } from "vitest";
import {
  type CharacterFacts,
  getBuiltinField,
  isSensitive,
  parseCharacterFacts,
} from "@/features/characters/domain";
import { createAiService, type AiContext } from "./service";
import { selectSectionFacts, aiSnapshotStale } from "./facts";
import { AiError, createOpenAiWriter, parseAiOutput, type SectionWriter } from "./provider";
import { AI_LIMITS } from "./constants";

function context(): AiContext {
  return {
    sectionId: "section",
    draftRevision: 2,
    title: "Tiểu sử",
    groups: ["background"],
    context: {},
    facts: {
      schemaVersion: 3,
      displayName: "An",
      values: {
        "background.birthplace": { state: "specified", value: "Huế" },
        "background.family": { state: "explicit_none" },
        "psychology.wounds": { state: "specified", value: "SECRET" },
      },
    },
  };
}
describe("section AI", () => {
  it("enforces expiry and timeout without retrying", async () => {
    vi.useFakeTimers();
    try {
      const service = createAiService();
      const input = context();
      const expired = service.preview(input, []);
      vi.advanceTimersByTime(AI_LIMITS.ttlMs + 1);
      const generate = vi.fn<SectionWriter["generate"]>(() => new Promise<unknown>(() => {}));
      await expect(
        service.generate(expired.token, "", { generate }, async () => input),
      ).rejects.toThrow("expired");
      const preview = service.preview(input, []);
      const pending = service.generate(preview.token, "", { generate }, async () => input);
      const rejected = expect(pending).rejects.toThrow("timeout");
      await vi.advanceTimersByTimeAsync(AI_LIMITS.timeoutMs + 1);
      await rejected;
      expect(generate).toHaveBeenCalledTimes(1);
      expect(generate.mock.calls[0]![2].aborted).toBe(true);
      expect(generate.mock.calls[0]![2].reason.name).toBe("TimeoutError");
    } finally {
      vi.useRealTimers();
    }
  });
  it("does not silently overwrite a changed draft and retains the candidate on write conflict", async () => {
    const service = createAiService();
    const input = context();
    const preview = service.preview(input, []);
    const candidate = await service.generate(
      preview.token,
      "",
      { generate: async () => ({ paragraphs: ["AI"] }) },
      async () => input,
    );
    const current = { ...input, draftRevision: 3 };
    const write = vi.fn(async (value: { draftRevision: number }) => {
      expect(value.draftRevision).toBe(2);
      throw new Error("revision_conflict");
    });
    await expect(service.apply(candidate.token, false, async () => current, write)).rejects.toThrow(
      "revision_conflict",
    );
    await expect(service.apply(candidate.token, false, async () => current, write)).rejects.toThrow(
      "revision_conflict",
    );
  });
  it("previews exactly the provider facts and never writes until explicitly applied", async () => {
    const service = createAiService();
    const input = context();
    const before = structuredClone(input);
    const preview = service.preview(input, []);
    expect(preview.json).not.toContain("SECRET");
    expect(preview.json).not.toContain("background.family");
    expect(preview.permissions).toContain("background.family");
    const generate = vi.fn<SectionWriter["generate"]>(async () => ({
      paragraphs: ["An sinh tại Huế."],
    }));
    const candidate = await service.generate(preview.token, "", { generate }, async () => input);
    expect(generate.mock.calls[0]?.[0]).toBe(preview.json);
    expect(input).toEqual(before);
    const write = vi.fn(async () => ({ draftRevision: 3, savedAt: "now" }));
    await service.apply(candidate.token, false, async () => input, write);
    expect(write).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        draftRevision: 2,
        snapshot: expect.objectContaining({ scope: ["displayName", "background.birthplace"] }),
      }),
    );
    await expect(service.apply(candidate.token, false, async () => input, write)).rejects.toThrow(
      "expired",
    );
  });
  it("sensitive absence/inapplicability permissions only affect this request", async () => {
    const service = createAiService();
    const input = context();
    for (const state of ["explicit_none", "not_applicable"] as const) {
      input.facts.values["background.family"] = { state };
      const permitted = service.preview(input, ["background.family"]);
      expect(permitted.json).toContain(state);
      expect(service.preview(input, []).json).not.toContain("background.family");
    }
    const preview = service.preview(input, ["background.family"]);
    const writer = {
      generate: vi.fn(async () => {
        throw new AiError("rateLimit");
      }),
    };
    await expect(service.generate(preview.token, "", writer, async () => input)).rejects.toThrow(
      "rateLimit",
    );
    await expect(service.generate(preview.token, "", writer, async () => input)).rejects.toThrow(
      "expired",
    );
    expect(writer.generate).toHaveBeenCalledTimes(1);
  });
  it("rejects changed preview before calling provider", async () => {
    const service = createAiService();
    const input = context();
    const preview = service.preview(input, []);
    const latest = structuredClone(input);
    latest.facts.displayName = "B";
    const generate = vi.fn();
    await expect(
      service.generate(preview.token, "", { generate }, async () => latest),
    ).rejects.toThrow("changed");
    expect(generate).not.toHaveBeenCalled();
  });
  it("warns about facts changing during generation and requires acknowledgement on apply", async () => {
    const service = createAiService();
    const input = context();
    const preview = service.preview(input, []);
    let latest = input;
    const writer = {
      generate: async () => {
        latest = structuredClone(input);
        latest.facts.displayName = "B";
        return { paragraphs: ["An."] };
      },
    };
    const candidate = await service.generate(preview.token, "", writer, async () => latest);
    expect(candidate.stale).toBe(true);
    const write = vi.fn(async () => ({ draftRevision: 3, savedAt: "now" }));
    await expect(service.apply(candidate.token, false, async () => latest, write)).rejects.toThrow(
      "stale",
    );
    expect(write).not.toHaveBeenCalled();
    await service.apply(candidate.token, true, async () => latest, write);
    expect(write).toHaveBeenCalledTimes(1);
  });
  it("rejects empty scoped facts and malformed/blank/oversized output", async () => {
    const service = createAiService();
    const input = context();
    input.groups = ["psychology"];
    const preview = service.preview(input, []);
    expect(preview.empty).toBe(true);
    const generate = vi.fn();
    await expect(
      service.generate(preview.token, "", { generate }, async () => input),
    ).rejects.toThrow("empty");
    expect(generate).not.toHaveBeenCalled();
    for (const output of [
      null,
      {},
      { paragraphs: [] },
      { paragraphs: [" "] },
      { paragraphs: ["a".repeat(AI_LIMITS.outputChars + 1)] },
      { paragraphs: ["ok"], html: "<script>" },
    ])
      expect(() => parseAiOutput(output)).toThrow("output");
    expect(parseAiOutput({ paragraphs: ["<script>alert(1)</script>"] }).content[0]).toMatchObject({
      type: "paragraph",
    });
  });
  it("filters sensitive items/subfields and fingerprints only received content", () => {
    const facts: CharacterFacts = {
      schemaVersion: 3,
      displayName: "An",
      values: {
        "appearance.scars": {
          state: "specified",
          sensitiveItemIds: ["hidden"],
          value: [
            { id: "seen", location: "tay", origin: "SECRET" },
            { id: "hidden", location: "SECRET" },
          ],
        },
      },
    };
    const selected = selectSectionFacts(facts, {}, ["appearance"]);
    expect(selected.json).not.toContain("SECRET");
    expect(selected.json).not.toContain("sensitiveItemIds");
    expect(aiSnapshotStale(selected.snapshot, facts)).toBe(false);
    const changed = structuredClone(facts);
    changed.values["appearance.scars"] = {
      state: "specified",
      value: [{ id: "seen", location: "chân", origin: "SECRET" }],
    };
    expect(aiSnapshotStale(selected.snapshot, changed)).toBe(true);
    const allowed = selectSectionFacts(facts, {}, ["appearance"], ["appearance.scars[hidden]"]);
    expect(allowed.json).toContain("hidden");
    expect(allowed.json).not.toContain('"origin":"SECRET"');
  });
  it("missing configuration never calls fetch; network/rate/output errors do not retry", async () => {
    const request = vi.fn<typeof fetch>();
    await expect(
      createOpenAiWriter(undefined, undefined, request).generate(
        "{}",
        "",
        new AbortController().signal,
      ),
    ).rejects.toThrow("openaiKeyMissing");
    expect(request).not.toHaveBeenCalled();
    request.mockResolvedValueOnce(new Response("private provider error", { status: 429 }));
    await expect(
      createOpenAiWriter("secret", "configured-model", request).generate(
        "{}",
        "",
        new AbortController().signal,
      ),
    ).rejects.toThrow("rateLimit");
    expect(request).toHaveBeenCalledTimes(1);
  });
});

describe("section AI background jobs", () => {
  const ok = { paragraphs: ["An sinh tại Huế."] };

  it("returns a job at once and finishes it in the background", async () => {
    const service = createAiService();
    const input = context();
    let release!: (value: unknown) => void;
    const generate = vi.fn<SectionWriter["generate"]>(
      () => new Promise((resolve) => (release = resolve)),
    );
    const job = await service.start(
      service.preview(input, []).token,
      "",
      { generate },
      async () => input,
    );
    expect(job.status).toMatch(/queued|running/);
    expect(service.job(job.id)?.status).toBe("running");
    expect(service.jobsForSections(["section"]).map((view) => view.id)).toEqual([job.id]);

    release(ok);
    const done = await service.wait(job.id);
    expect(done?.status).toBe("succeeded");
    expect(done?.result?.content.content[0]).toMatchObject({ type: "paragraph" });
    // Polling reads memory only.
    service.job(job.id);
    service.job(job.id);
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it("never runs two generations for one section", async () => {
    const service = createAiService();
    const input = context();
    const generate = vi.fn<SectionWriter["generate"]>(() => new Promise(() => {}));
    const first = await service.start(
      service.preview(input, []).token,
      "",
      { generate },
      async () => input,
    );
    const second = await service.start(
      service.preview(input, []).token,
      "",
      { generate },
      async () => input,
    );
    expect(second.id).toBe(first.id);
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it("uses the configured deadline and aborts the request", async () => {
    vi.useFakeTimers();
    try {
      const service = createAiService();
      const input = context();
      const generate = vi.fn<SectionWriter["generate"]>(() => new Promise(() => {}));
      const job = await service.start(
        service.preview(input, []).token,
        "",
        { generate },
        async () => input,
        { timeoutMs: 30_000 },
      );
      expect(Date.parse(job.deadlineAt) - Date.parse(job.startedAt)).toBe(30_000);
      await vi.advanceTimersByTimeAsync(30_001);
      expect(service.job(job.id)).toMatchObject({ status: "failed", error: { code: "timeout" } });
      expect(generate.mock.calls[0]![2].aborted).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("cancels: aborts the request and ignores a late answer", async () => {
    const service = createAiService();
    const input = context();
    let release!: (value: unknown) => void;
    const generate = vi.fn<SectionWriter["generate"]>(
      () => new Promise((resolve) => (release = resolve)),
    );
    const job = await service.start(
      service.preview(input, []).token,
      "",
      { generate },
      async () => input,
    );
    expect(service.cancel(job.id)?.status).toBe("cancelled");
    expect(generate.mock.calls[0]![2].aborted).toBe(true);
    release(ok);
    await service.wait(job.id);
    const view = service.job(job.id);
    expect(view?.status).toBe("cancelled");
    expect(view?.result).toBeUndefined();
  });

  it("keeps a suggestion for 15 minutes from when it was produced, then forgets the job", async () => {
    vi.useFakeTimers();
    try {
      const service = createAiService();
      const input = context();
      let release!: (value: unknown) => void;
      const generate = vi.fn<SectionWriter["generate"]>(
        () => new Promise((resolve) => (release = resolve)),
      );
      const job = await service.start(
        service.preview(input, []).token,
        "",
        { generate },
        async () => input,
      );
      // A slow provider: the 15 minutes start only when the result exists.
      await vi.advanceTimersByTimeAsync(4 * 60_000);
      release(ok);
      const done = await service.wait(job.id);
      expect(Date.parse(done!.result!.expiresAt) - Date.parse(done!.finishedAt!)).toBe(
        AI_LIMITS.ttlMs,
      );
      await vi.advanceTimersByTimeAsync(AI_LIMITS.ttlMs - 1_000);
      expect(service.job(job.id)?.status).toBe("succeeded");
      await vi.advanceTimersByTimeAsync(2_000);
      expect(service.job(job.id)).toBeNull();
      await expect(
        service.apply(done!.result!.token, false, async () => input, vi.fn()),
      ).rejects.toThrow("expired");
    } finally {
      vi.useRealTimers();
    }
  });

  it("reports provider failures on the job, with the specific code", async () => {
    const service = createAiService();
    const input = context();
    for (const code of ["blocked", "rateLimit", "dns", "outputEmpty"] as const) {
      const job = await service.start(
        service.preview(input, []).token,
        "",
        { generate: async () => Promise.reject(new AiError(code)) },
        async () => input,
      );
      const done = await service.wait(job.id);
      expect(done).toMatchObject({ status: "failed", error: { code } });
      service.dismiss(job.id);
      expect(service.job(job.id)).toBeNull();
    }
  });

  it("does not know jobs of another server process", () => {
    expect(createAiService().job("00000000-0000-4000-8000-000000000000")).toBeNull();
  });
});

describe("body details field (TASK 10)", () => {
  const facts: CharacterFacts = {
    schemaVersion: 3,
    displayName: "An",
    values: {
      "appearance.overview": { state: "specified", value: "Cao gầy." },
      "appearance.body_details": { state: "specified", value: "CHI TIẾT RIÊNG TƯ" },
    },
  };

  it("is a valid fact on its own: saving needs no provider", () => {
    expect(parseCharacterFacts(facts).success).toBe(true);
    expect(isSensitive(getBuiltinField("appearance.body_details")!)).toBe(true);
  });

  it("is left out of the AI payload unless allowed for that request", () => {
    const withheld = selectSectionFacts(facts, {}, ["appearance"]);
    expect(withheld.json).toContain("Cao gầy.");
    expect(withheld.json).not.toContain("CHI TIẾT RIÊNG TƯ");
    expect(withheld.permissions).toContain("appearance.body_details");

    const allowed = selectSectionFacts(facts, {}, ["appearance"], ["appearance.body_details"]);
    expect(allowed.json).toContain("CHI TIẾT RIÊNG TƯ");
    // Permission is not remembered: the next selection without it withholds the field again.
    expect(selectSectionFacts(facts, {}, ["appearance"]).json).not.toContain("CHI TIẾT");
  });
});

describe("model fixed per job", () => {
  it("keeps the model a job was created with, whatever is chosen afterwards", async () => {
    const service = createAiService();
    const input = context();
    const generate = vi.fn<SectionWriter["generate"]>(() => new Promise(() => {}));
    const lite = { id: "gemini-3.5-flash-lite", label: "Gemini 3.5 Flash-Lite" };
    const job = await service.start(
      service.preview(input, []).token,
      "",
      { generate },
      async () => input,
      {
        model: lite,
      },
    );
    expect(job.model).toEqual(lite);
    // Starting again with another model returns the running job, still on its own model.
    const again = await service.start(
      service.preview(input, []).token,
      "",
      { generate },
      async () => input,
      { model: { id: "gemini-3.8-flash", label: "Gemini 3.8 Flash" } },
    );
    expect(again.id).toBe(job.id);
    expect(service.job(job.id)?.model).toEqual(lite);
    expect(generate).toHaveBeenCalledTimes(1);
  });
});
