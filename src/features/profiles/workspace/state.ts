/**
 * Profile workspace state (pure, no React): section structure plus one draft state per section.
 *
 * Each section saves on its own (`draftRevision`), so editing one section never blocks or
 * conflicts with another. Saves are sequential per workspace; an edit made while a save is in
 * flight keeps the section "dirty" and is saved next — "saved" is only shown for content the
 * server confirmed.
 */
import {
  isDocumentEmpty,
  parseRichTextDocument,
  type RichTextDocument,
  sameContent,
  sectionStatus,
  type SectionStatus,
} from "@/features/profiles/domain";
import type {
  ApprovedView,
  ProfileStructureView,
  ProfileView,
  SectionStructureView,
} from "@/features/profiles/view";

export type SaveStatus = "idle" | "dirty" | "saving" | "saved" | "error" | "conflict";

export type ConflictState = {
  message: string;
  /** Newer stored draft, once loaded (`undefined` while loading, `null` if loading failed). */
  latest?: { draft: RichTextDocument | null; draftRevision: number } | null;
};

export type SectionDraftState = {
  /** What the editor shows (possibly unsaved). `null` = nothing was ever written. */
  content: RichTextDocument | null;
  /** Last content the server confirmed. */
  saved: RichTextDocument | null;
  draftRevision: number;
  savedAt: string | null;
  status: SaveStatus;
  /** Content of the request in flight. */
  saving: RichTextDocument | null;
  /** Next save replaces a newer stored draft ("keep mine" after a conflict). */
  replaceNewer: boolean;
  error: string | null;
  /** Validation messages for the working content. */
  invalid: string[];
  conflict: ConflictState | null;
  approved: ApprovedView | null;
  /** Bumped when the content is replaced from outside the editor (restore, load latest). */
  resetCount: number;
};

export type WorkspaceState = {
  profileId: string;
  characterId: string;
  revision: number;
  sections: SectionStructureView[];
  drafts: Record<string, SectionDraftState>;
  activeId: string;
};

export type WorkspaceAction =
  | { type: "select"; sectionId: string }
  | { type: "edit"; sectionId: string; content: RichTextDocument }
  | { type: "saveStarted"; sectionId: string; snapshot: RichTextDocument }
  | {
      type: "saveSucceeded";
      sectionId: string;
      snapshot: RichTextDocument;
      draftRevision: number;
      savedAt: string;
    }
  | { type: "saveFailed"; sectionId: string; message: string }
  | { type: "conflict"; sectionId: string; message: string }
  | { type: "conflictLoaded"; sectionId: string; latest: ConflictState["latest"] }
  | { type: "useLatest"; sectionId: string }
  | { type: "keepMine"; sectionId: string }
  | { type: "approved"; sectionId: string; approved: ApprovedView }
  | {
      type: "replaced";
      sectionId: string;
      content: RichTextDocument;
      draftRevision: number;
      savedAt: string;
    }
  | { type: "structure"; structure: ProfileStructureView; select?: string };

function validationMessages(content: RichTextDocument | null): string[] {
  if (content === null) return [];
  const result = parseRichTextDocument(content);
  return result.success ? [] : [...new Set(result.error.issues.map((issue) => issue.message))];
}

function initialDraft(section: ProfileView["sections"][number]): SectionDraftState {
  return {
    content: section.draft,
    saved: section.draft,
    draftRevision: section.draftRevision,
    savedAt: section.draftUpdatedAt,
    status: "idle",
    saving: null,
    replaceNewer: false,
    error: null,
    invalid: [],
    conflict: null,
    approved: section.approved,
    resetCount: 0,
  };
}

export function createWorkspaceState(
  profile: ProfileView,
  initialSection?: string,
): WorkspaceState {
  const sections = profile.sections.map(({ id, key, title, isHidden, sourceGroups }) => ({
    id,
    key,
    title,
    isHidden,
    sourceGroups,
  }));
  const active =
    sections.find((section) => section.id === initialSection || section.key === initialSection) ??
    sections.find((section) => !section.isHidden) ??
    sections[0];
  return {
    profileId: profile.id,
    characterId: profile.characterId,
    revision: profile.revision,
    sections,
    drafts: Object.fromEntries(
      profile.sections.map((section) => [section.id, initialDraft(section)]),
    ),
    activeId: active?.id ?? "",
  };
}

function updateDraft(
  state: WorkspaceState,
  sectionId: string,
  update: (draft: SectionDraftState) => SectionDraftState,
): WorkspaceState {
  const draft = state.drafts[sectionId];
  if (!draft) return state;
  return { ...state, drafts: { ...state.drafts, [sectionId]: update(draft) } };
}

const isUnsaved = (draft: SectionDraftState) => !sameContent(draft.content, draft.saved);

export function workspaceReducer(state: WorkspaceState, action: WorkspaceAction): WorkspaceState {
  switch (action.type) {
    case "select":
      return state.drafts[action.sectionId] ? { ...state, activeId: action.sectionId } : state;

    case "edit":
      return updateDraft(state, action.sectionId, (draft) => {
        const next = {
          ...draft,
          content: action.content,
          invalid: validationMessages(action.content),
        };
        if (draft.status === "conflict" || draft.status === "saving") return next;
        const dirty = isUnsaved(next);
        return { ...next, status: dirty ? "dirty" : draft.savedAt ? "saved" : "idle", error: null };
      });

    case "saveStarted":
      return updateDraft(state, action.sectionId, (draft) => ({
        ...draft,
        status: "saving",
        saving: action.snapshot,
        error: null,
      }));

    case "saveSucceeded":
      return updateDraft(state, action.sectionId, (draft) => {
        const next: SectionDraftState = {
          ...draft,
          saved: action.snapshot,
          draftRevision: action.draftRevision,
          savedAt: action.savedAt,
          saving: null,
          replaceNewer: false,
        };
        return { ...next, status: isUnsaved(next) ? "dirty" : "saved" };
      });

    case "saveFailed":
      // The working content stays untouched: nothing the user wrote is lost.
      return updateDraft(state, action.sectionId, (draft) => ({
        ...draft,
        status: "error",
        saving: null,
        error: action.message,
      }));

    case "conflict":
      return updateDraft(state, action.sectionId, (draft) => ({
        ...draft,
        status: "conflict",
        saving: null,
        error: null,
        conflict: { message: action.message },
      }));

    case "conflictLoaded":
      return updateDraft(state, action.sectionId, (draft) =>
        draft.conflict
          ? { ...draft, conflict: { ...draft.conflict, latest: action.latest } }
          : draft,
      );

    case "useLatest":
      return updateDraft(state, action.sectionId, (draft) => {
        const latest = draft.conflict?.latest;
        if (!latest) return draft;
        return {
          ...draft,
          content: latest.draft,
          saved: latest.draft,
          draftRevision: latest.draftRevision,
          status: "saved",
          conflict: null,
          invalid: validationMessages(latest.draft),
          resetCount: draft.resetCount + 1,
        };
      });

    case "keepMine":
      // Explicit user choice: save the local content over the newer draft, which the server
      // first records in the history.
      return updateDraft(state, action.sectionId, (draft) => {
        const latest = draft.conflict?.latest;
        if (!latest) return draft;
        return {
          ...draft,
          saved: latest.draft,
          draftRevision: latest.draftRevision,
          replaceNewer: true,
          conflict: null,
          status: "dirty",
        };
      });

    case "approved":
      return updateDraft(state, action.sectionId, (draft) => ({
        ...draft,
        approved: action.approved,
      }));

    case "replaced":
      return updateDraft(state, action.sectionId, (draft) => ({
        ...draft,
        content: action.content,
        saved: action.content,
        draftRevision: action.draftRevision,
        savedAt: action.savedAt,
        status: "saved",
        error: null,
        invalid: validationMessages(action.content),
        resetCount: draft.resetCount + 1,
      }));

    case "structure": {
      const drafts = { ...state.drafts };
      for (const section of action.structure.sections) {
        drafts[section.id] ??= initialDraft({
          ...section,
          draft: null,
          draftRevision: 1,
          draftUpdatedAt: null,
          approved: null,
        });
      }
      return {
        ...state,
        revision: action.structure.revision,
        sections: action.structure.sections,
        drafts,
        activeId: action.select ?? state.activeId,
      };
    }
  }
}

// ---------------------------------------------------------------------------
// Derived state
// ---------------------------------------------------------------------------

export function canAutosave(draft: SectionDraftState): boolean {
  return draft.status === "dirty" && draft.invalid.length === 0 && draft.content !== null;
}

/** Sections whose content is not safely stored (leaving the page would lose something). */
export function unsavedSections(state: WorkspaceState): string[] {
  return Object.entries(state.drafts)
    .filter(([, draft]) => draft.status !== "idle" && draft.status !== "saved")
    .map(([id]) => id);
}

export function statusOfSection(draft: SectionDraftState): SectionStatus {
  return sectionStatus(draft.content, draft.approved);
}

export type ApproveBlock = "empty" | "unsaved" | "invalid" | "conflict" | "same";

/**
 * Why the draft cannot be approved right now, or `null` if it can. Only content the server has
 * stored (and that is valid) can be approved.
 */
export function approveBlock(draft: SectionDraftState): ApproveBlock | null {
  if (draft.status === "conflict") return "conflict";
  if (draft.invalid.length > 0) return "invalid";
  if (isDocumentEmpty(draft.content)) return "empty";
  if (draft.status !== "saved" && draft.status !== "idle") return "unsaved";
  if (isUnsaved(draft)) return "unsaved";
  if (statusOfSection(draft) === "approved") return "same";
  return null;
}

/** Restoring needs the stored draft revision, so the section must be fully saved. */
export function canRestore(draft: SectionDraftState): boolean {
  return (draft.status === "saved" || draft.status === "idle") && !isUnsaved(draft);
}
