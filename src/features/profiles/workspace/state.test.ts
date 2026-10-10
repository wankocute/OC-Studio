import { describe, expect, it } from "vitest";

import { contentHash, emptyDocument, type RichTextDocument } from "@/features/profiles/domain";
import type { ApprovedView, ProfileView } from "@/features/profiles/view";

import {
  approveBlock,
  canAutosave,
  canRestore,
  createWorkspaceState,
  statusOfSection,
  unsavedSections,
  workspaceReducer,
  type WorkspaceAction,
  type WorkspaceState,
} from "./state";

const doc = (text: string): RichTextDocument => ({
  type: "doc",
  content: [{ type: "paragraph", content: [{ type: "text", text }] }],
});

const approvedView = (content: RichTextDocument): ApprovedView => ({
  revisionId: "rev-1",
  content,
  hash: contentHash(content),
  approvedAt: "2026-10-10T08:00:00.000Z",
  facts: { status: "fresh" },
});

const profile: ProfileView = {
  id: "p1",
  characterId: "c1",
  revision: 3,
  sections: [
    {
      id: "s1",
      key: "intro",
      title: null,
      isHidden: true,
      sourceGroups: ["identity"],
      draft: null,
      draftRevision: 1,
      draftUpdatedAt: null,
      approved: null,
    },
    {
      id: "s2",
      key: "appearance",
      title: null,
      isHidden: false,
      sourceGroups: ["appearance"],
      draft: doc("Bản duyệt"),
      draftRevision: 4,
      draftUpdatedAt: "2026-10-10T08:00:00.000Z",
      approved: approvedView(doc("Bản duyệt")),
    },
  ],
};

const run = (state: WorkspaceState, ...actions: WorkspaceAction[]) =>
  actions.reduce(workspaceReducer, state);

describe("profile workspace state", () => {
  it("opens the requested section, else the first visible one", () => {
    expect(createWorkspaceState(profile).activeId).toBe("s2");
    expect(createWorkspaceState(profile, "intro").activeId).toBe("s1");
    expect(createWorkspaceState(profile, "s2").activeId).toBe("s2");
  });

  it("marks edits dirty, and back to saved when the content returns to the stored one", () => {
    let state = createWorkspaceState(profile);
    state = run(state, { type: "edit", sectionId: "s2", content: doc("Sửa") });
    expect(state.drafts.s2!.status).toBe("dirty");
    expect(canAutosave(state.drafts.s2!)).toBe(true);
    expect(statusOfSection(state.drafts.s2!)).toBe("changed");
    expect(unsavedSections(state)).toEqual(["s2"]);

    state = run(state, { type: "edit", sectionId: "s2", content: doc("Bản duyệt") });
    expect(state.drafts.s2!.status).toBe("saved");
    expect(unsavedSections(state)).toEqual([]);
  });

  it("keeps editing during a save and saves the newer content next", () => {
    let state = createWorkspaceState(profile);
    state = run(
      state,
      { type: "edit", sectionId: "s2", content: doc("A") },
      { type: "saveStarted", sectionId: "s2", snapshot: doc("A") },
      { type: "edit", sectionId: "s2", content: doc("AB") },
    );
    expect(state.drafts.s2!.status).toBe("saving");
    state = run(state, {
      type: "saveSucceeded",
      sectionId: "s2",
      snapshot: doc("A"),
      draftRevision: 5,
      savedAt: "2026-10-10T08:01:00.000Z",
    });
    expect(state.drafts.s2).toMatchObject({ status: "dirty", draftRevision: 5, saved: doc("A") });
    expect(state.drafts.s2!.content).toEqual(doc("AB"));
  });

  it("keeps the user's content when a save fails", () => {
    const state = run(
      createWorkspaceState(profile),
      { type: "edit", sectionId: "s2", content: doc("Chưa lưu") },
      { type: "saveStarted", sectionId: "s2", snapshot: doc("Chưa lưu") },
      { type: "saveFailed", sectionId: "s2", message: "offline" },
    );
    expect(state.drafts.s2).toMatchObject({ status: "error", content: doc("Chưa lưu") });
    expect(unsavedSections(state)).toEqual(["s2"]);
  });

  it("does not autosave invalid content", () => {
    const invalid = { type: "doc", content: [] } as unknown as RichTextDocument;
    const state = run(createWorkspaceState(profile), {
      type: "edit",
      sectionId: "s2",
      content: invalid,
    });
    expect(state.drafts.s2!.invalid.length).toBeGreaterThan(0);
    expect(canAutosave(state.drafts.s2!)).toBe(false);
    expect(approveBlock(state.drafts.s2!)).toBe("invalid");
  });

  it("pauses on conflict; 'use latest' discards, 'keep mine' saves over the newer draft", () => {
    const conflicted = run(
      createWorkspaceState(profile),
      { type: "edit", sectionId: "s2", content: doc("Của tôi") },
      { type: "saveStarted", sectionId: "s2", snapshot: doc("Của tôi") },
      { type: "conflict", sectionId: "s2", message: "conflict" },
      { type: "edit", sectionId: "s2", content: doc("Của tôi 2") },
    );
    expect(conflicted.drafts.s2!.status).toBe("conflict");
    expect(canAutosave(conflicted.drafts.s2!)).toBe(false);
    expect(approveBlock(conflicted.drafts.s2!)).toBe("conflict");

    const loaded = run(conflicted, {
      type: "conflictLoaded",
      sectionId: "s2",
      latest: { draft: doc("Tab khác"), draftRevision: 6 },
    });

    const latest = run(loaded, { type: "useLatest", sectionId: "s2" });
    expect(latest.drafts.s2).toMatchObject({
      status: "saved",
      content: doc("Tab khác"),
      draftRevision: 6,
      conflict: null,
    });
    expect(latest.drafts.s2!.resetCount).toBe(1);

    const mine = run(loaded, { type: "keepMine", sectionId: "s2" });
    expect(mine.drafts.s2).toMatchObject({
      status: "dirty",
      content: doc("Của tôi 2"),
      draftRevision: 6,
      replaceNewer: true,
    });
    expect(canAutosave(mine.drafts.s2!)).toBe(true);
  });

  it("only allows approving saved, non-empty, changed content", () => {
    let state = createWorkspaceState(profile);
    expect(approveBlock(state.drafts.s2!)).toBe("same");
    expect(approveBlock(state.drafts.s1!)).toBe("empty");

    state = run(state, { type: "edit", sectionId: "s2", content: doc("Mới") });
    expect(approveBlock(state.drafts.s2!)).toBe("unsaved");
    state = run(
      state,
      { type: "saveStarted", sectionId: "s2", snapshot: doc("Mới") },
      {
        type: "saveSucceeded",
        sectionId: "s2",
        snapshot: doc("Mới"),
        draftRevision: 5,
        savedAt: "2026-10-10T08:02:00.000Z",
      },
    );
    expect(approveBlock(state.drafts.s2!)).toBeNull();
    expect(canRestore(state.drafts.s2!)).toBe(true);

    state = run(state, { type: "approved", sectionId: "s2", approved: approvedView(doc("Mới")) });
    expect(statusOfSection(state.drafts.s2!)).toBe("approved");
    expect(approveBlock(state.drafts.s2!)).toBe("same");
  });

  it("replaces the draft on restore without touching the approved content", () => {
    const state = run(createWorkspaceState(profile), {
      type: "replaced",
      sectionId: "s2",
      content: doc("Cũ"),
      draftRevision: 5,
      savedAt: "2026-10-10T08:03:00.000Z",
    });
    expect(state.drafts.s2).toMatchObject({ content: doc("Cũ"), status: "saved", resetCount: 1 });
    expect(state.drafts.s2!.approved?.content).toEqual(doc("Bản duyệt"));
  });

  it("applies structure changes and keeps existing drafts", () => {
    const edited = run(createWorkspaceState(profile), {
      type: "edit",
      sectionId: "s2",
      content: doc("Đang viết"),
    });
    const state = run(edited, {
      type: "structure",
      structure: {
        revision: 4,
        sections: [
          { id: "s3", key: "ps_abcdef", title: "Phép thuật", isHidden: false, sourceGroups: [] },
          ...edited.sections,
        ],
      },
      select: "s3",
    });
    expect(state.revision).toBe(4);
    expect(state.activeId).toBe("s3");
    expect(state.sections.map((section) => section.id)).toEqual(["s3", "s1", "s2"]);
    expect(state.drafts.s3).toMatchObject({ content: null, status: "idle" });
    expect(state.drafts.s2!.content).toEqual(doc("Đang viết"));
  });

  it("saves the empty document when the user clears a section", () => {
    const state = run(createWorkspaceState(profile), {
      type: "edit",
      sectionId: "s2",
      content: emptyDocument(),
    });
    expect(canAutosave(state.drafts.s2!)).toBe(true);
    expect(statusOfSection(state.drafts.s2!)).toBe("changed");
  });
});
