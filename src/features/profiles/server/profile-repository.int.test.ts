import { eq, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { contentRevisions, profileSections } from "@/db/schema";
import { sampleMinimal } from "@/features/characters/__tests__/fixtures/sample-characters";
import { createFactSnapshot } from "@/features/characters/domain";
import { createCharacterRepository } from "@/features/characters/server/character-repository";
import {
  CHECKPOINT_INTERVAL_MS,
  DEFAULT_PROFILE_TEMPLATE,
  type RichTextDocument,
} from "@/features/profiles/domain";
import { connectTestDatabase } from "@/test/integration-context";

import { createProfileRepository } from "./profile-repository";

const { db } = connectTestDatabase();
const characters = createCharacterRepository(db);
const profiles = createProfileRepository(db);

const doc = (text: string): RichTextDocument => ({
  type: "doc",
  content: [{ type: "paragraph", content: [{ type: "text", text }] }],
});
const snapshot = createFactSnapshot({ displayName: "c53:00000000000001" }, ["displayName"]);
const at = (minutes: number) => new Date(Date.UTC(2026, 9, 10, 8, 0) + minutes * 60_000);

async function setup() {
  const character = await characters.create({ ...sampleMinimal, displayName: "Ngọc" });
  const profile = await profiles.createPrimary(character.id);
  const section = profile.sections.find((item) => item.key === "appearance")!;
  return { character, profile, section };
}

async function revisionCount(sectionId: string) {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(contentRevisions)
    .where(eq(contentRevisions.sectionId, sectionId));
  return row!.n;
}

describe("profile repository", () => {
  it("AI apply preserves history/approval/facts, locks the original draft, and carries provenance to approval", async () => {
    const { character, section } = await setup();
    const saved = await profiles.saveDraft(section.id, doc("Manual"), 1);
    await profiles.approve(section.id, saved.draftRevision, snapshot);
    const before = await characters.getById(character.id);
    const aiSource = { ...snapshot, aiProjection: { displayName: true as const } };
    await expect(profiles.applyAiDraft(section.id, 1, doc("AI"), aiSource)).rejects.toMatchObject({
      code: "revision_conflict",
    });
    const applied = await profiles.applyAiDraft(
      section.id,
      saved.draftRevision,
      doc("AI"),
      aiSource,
    );
    const current = await profiles.getSection(section.id);
    expect(current.draft).toEqual(doc("AI"));
    expect(current.approved?.content).toEqual(doc("Manual"));
    expect((await profiles.listHistory(section.id)).some((item) => item.excerpt === "Manual")).toBe(
      true,
    );
    expect((await characters.getById(character.id)).facts).toEqual(before.facts);
    const approved = await profiles.approve(section.id, applied.draftRevision, snapshot);
    expect(approved.changed && approved.approved.factSnapshot).toEqual(aiSource);
  });
  it("has no profile until one is started, then the template's sections", async () => {
    const character = await characters.create({ ...sampleMinimal, displayName: "An" });
    expect(await profiles.getPrimary(character.id)).toBeNull();

    const profile = await profiles.createPrimary(character.id);
    expect(profile.sections.map((section) => section.key)).toEqual(
      DEFAULT_PROFILE_TEMPLATE.sections.map((section) => section.key),
    );
    expect(profile.sections.every((section) => section.draft === null && !section.approved)).toBe(
      true,
    );
    expect(profile.sections[1]!.sourceGroups).toEqual(["appearance"]);

    // Starting again (another tab) returns the same profile instead of a second one.
    const again = await profiles.createPrimary(character.id);
    expect(again.id).toBe(profile.id);
    expect(again.sections).toHaveLength(profile.sections.length);
  });

  it("refuses profiles of deleted characters", async () => {
    const character = await characters.create({ ...sampleMinimal, displayName: "Xóa" });
    await characters.softDelete(character.id, character.revision);
    await expect(profiles.createPrimary(character.id)).rejects.toMatchObject({
      code: "not_found",
    });
    await expect(profiles.getPrimary(character.id)).rejects.toMatchObject({ code: "not_found" });
  });

  it("saves drafts with optimistic locking and validates content", async () => {
    const { section } = await setup();
    const saved = await profiles.saveDraft(section.id, doc("Tóc bạc"), 1);
    expect(saved.draftRevision).toBe(2);

    // A second tab still holding revision 1 cannot overwrite the newer draft.
    await expect(profiles.saveDraft(section.id, doc("Cũ"), 1)).rejects.toMatchObject({
      code: "revision_conflict",
      details: { expectedRevision: 1, actualRevision: 2 },
    });
    await expect(
      profiles.saveDraft(section.id, { type: "doc", content: [{ type: "image" }] }, 2),
    ).rejects.toMatchObject({ code: "validation_failed" });

    const stored = await profiles.getSection(section.id);
    expect(stored.draft).toEqual(doc("Tóc bạc"));
    expect(stored.draftRevision).toBe(2);
  });

  it("approves the saved draft separately; later drafts never change it", async () => {
    const { section } = await setup();
    await profiles.saveDraft(section.id, doc("Bản một"), 1);

    // Approving needs the revision the user saw: an outdated view cannot approve.
    await expect(profiles.approve(section.id, 1, snapshot)).rejects.toMatchObject({
      code: "revision_conflict",
    });
    const approved = await profiles.approve(section.id, 2, snapshot);
    expect(approved.changed).toBe(true);

    await profiles.saveDraft(section.id, doc("Bản hai"), 2);
    const stored = await profiles.getSection(section.id);
    expect(stored.draft).toEqual(doc("Bản hai"));
    expect(stored.approved?.content).toEqual(doc("Bản một"));
    expect(stored.approved?.factSnapshot).toEqual(snapshot);
  });

  it("does not approve empty or unchanged content", async () => {
    const { section } = await setup();
    await expect(profiles.approve(section.id, 1, snapshot)).rejects.toMatchObject({
      code: "validation_failed",
    });
    await profiles.saveDraft(section.id, doc("Nội dung"), 1);
    await profiles.approve(section.id, 2, snapshot);
    expect(await profiles.approve(section.id, 2, snapshot)).toEqual({ changed: false });
    expect(await revisionCount(section.id)).toBe(1);
  });

  it("records autosave checkpoints only after a pause, and never duplicates", async () => {
    const { section } = await setup();
    await profiles.saveDraft(section.id, doc("a"), 1, { now: at(0) });
    await profiles.saveDraft(section.id, doc("ab"), 2, { now: at(1) });
    await profiles.saveDraft(section.id, doc("abc"), 3, { now: at(2) });
    expect(await revisionCount(section.id)).toBe(0);

    // Coming back after a pause records the draft as it was before the new session.
    const later = 2 + CHECKPOINT_INTERVAL_MS / 60_000;
    await profiles.saveDraft(section.id, doc("abcd"), 4, { now: at(later) });
    let history = await profiles.listHistory(section.id);
    expect(history.map((entry) => [entry.kind, entry.excerpt])).toEqual([["autosave", "abc"]]);

    // Same content again after another pause: nothing new.
    await profiles.saveDraft(section.id, doc("abcd"), 5, { now: at(later + 1) });
    await profiles.saveDraft(section.id, doc("abc"), 6, { now: at(later * 2 + 1) });
    history = await profiles.listHistory(section.id);
    expect(history.map((entry) => entry.excerpt)).toEqual(["abcd", "abc"]);
  });

  it("restores an older revision as the draft without touching the approved content", async () => {
    const { section } = await setup();
    await profiles.saveDraft(section.id, doc("Bản duyệt"), 1, { now: at(0) });
    const approved = await profiles.approve(section.id, 2, snapshot, { now: at(1) });
    await profiles.saveDraft(section.id, doc("Bản nháp mới"), 2, { now: at(2) });

    const [approval] = await profiles.listHistory(section.id);
    expect(approval!.kind).toBe("approval");
    const restored = await profiles.restore(section.id, approval!.id, 3, { now: at(3) });
    expect(restored).toMatchObject({ changed: true, draftRevision: 4 });

    const stored = await profiles.getSection(section.id);
    expect(stored.draft).toEqual(doc("Bản duyệt"));
    expect(stored.approved?.revisionId).toBe(approved.changed && approved.approved.revisionId);

    const history = await profiles.listHistory(section.id);
    expect(history.map((entry) => [entry.kind, entry.excerpt])).toEqual([
      ["restore", "Bản duyệt"],
      ["before_restore", "Bản nháp mới"],
      ["approval", "Bản duyệt"],
    ]);
    expect(history[0]!.restoredFromId).toBe(approval!.id);

    // Restoring what the draft already is changes nothing.
    expect(await profiles.restore(section.id, approval!.id, 4)).toEqual({ changed: false });
    await expect(profiles.restore(section.id, approval!.id, 3)).rejects.toMatchObject({
      code: "revision_conflict",
    });
  });

  it("keeps the replaced draft when a conflict is resolved with 'keep mine'", async () => {
    const { section } = await setup();
    await profiles.saveDraft(section.id, doc("Tab A"), 1);
    await profiles.saveDraft(section.id, doc("Tab B mới hơn"), 2);
    await profiles.saveDraft(section.id, doc("Tab A giữ lại"), 3, { replaceNewer: true });

    const history = await profiles.listHistory(section.id);
    expect(history.map((entry) => [entry.kind, entry.excerpt])).toEqual([
      ["conflict", "Tab B mới hơn"],
    ]);
    expect((await profiles.getSection(section.id)).draft).toEqual(doc("Tab A giữ lại"));
  });

  it("only lets a section approve its own revisions", async () => {
    const { profile, section } = await setup();
    const other = profile.sections.find((item) => item.key === "personality")!;
    await profiles.saveDraft(other.id, doc("Khác"), 1);
    await profiles.approve(other.id, 2, snapshot);
    const [foreign] = await profiles.listHistory(other.id);

    await expect(profiles.getRevision(section.id, foreign!.id)).rejects.toMatchObject({
      code: "not_found",
    });
    await expect(profiles.restore(section.id, foreign!.id, 1)).rejects.toMatchObject({
      code: "not_found",
    });
    // The database refuses it too (composite foreign key).
    await expect(
      db
        .update(profileSections)
        .set({ approvedRevisionId: foreign!.id })
        .where(eq(profileSections.id, section.id)),
    ).rejects.toThrow();
  });

  it("adds, renames, hides and reorders sections with the profile revision", async () => {
    const { profile } = await setup();
    const added = await profiles.addSection(profile.id, profile.revision, {
      title: "  Phép thuật  ",
      sourceGroups: ["lifestyle"],
    });
    expect(added.revision).toBe(profile.revision + 1);
    const custom = added.sections.find((section) => section.id === added.sectionId)!;
    expect(custom).toMatchObject({ title: "Phép thuật", sourceGroups: ["lifestyle"] });
    expect(custom.key).toMatch(/^ps_[a-z0-9]+$/);

    await expect(
      profiles.updateSection(profile.id, profile.revision, custom.id, { isHidden: true }),
    ).rejects.toMatchObject({ code: "revision_conflict" });

    const intro = added.sections[0]!;
    let next = await profiles.updateSection(profile.id, added.revision, intro.id, {
      title: "Lời mở đầu",
      isHidden: true,
    });
    expect(next.sections[0]).toMatchObject({ title: "Lời mở đầu", isHidden: true });
    next = await profiles.updateSection(profile.id, next.revision, intro.id, { title: null });
    expect(next.sections[0]!.title).toBeNull();

    await expect(
      profiles.updateSection(profile.id, next.revision, custom.id, { title: null }),
    ).rejects.toMatchObject({ code: "validation_failed" });
    await expect(
      profiles.updateSection(profile.id, next.revision, custom.id, { title: "   " }),
    ).rejects.toMatchObject({ code: "validation_failed" });

    const order = next.sections.map((section) => section.id).reverse();
    next = await profiles.reorderSections(profile.id, next.revision, order);
    expect(next.sections.map((section) => section.id)).toEqual(order);
    await expect(
      profiles.reorderSections(profile.id, next.revision, order.slice(1)),
    ).rejects.toMatchObject({ code: "validation_failed" });
  });
});
