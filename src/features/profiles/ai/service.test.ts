import { describe, expect, it, vi } from "vitest";
import type { CharacterFacts } from "@/features/characters/domain";
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
      const generate = vi.fn(() => new Promise<unknown>(() => {}));
      await expect(
        service.generate(expired.token, "", { generate }, async () => input),
      ).rejects.toThrow("expired");
      const preview = service.preview(input, []);
      const pending = service.generate(preview.token, "", { generate }, async () => input);
      const rejected = expect(pending).rejects.toThrow("network");
      await vi.advanceTimersByTimeAsync(AI_LIMITS.timeoutMs + 1);
      await rejected;
      expect(generate).toHaveBeenCalledTimes(1);
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
    ).rejects.toThrow("configuration");
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
