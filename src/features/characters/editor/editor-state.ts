/**
 * Editor state machine (pure reducer; the autosave side effects live in the React hook).
 *
 * - `base` is the sheet last confirmed by the database at `revision`; `working` is what the user
 *   sees. Only fields the user touched are rebuilt from drafts — every other fact keeps the exact
 *   stored object, so special states and unknown details are never rewritten by accident.
 * - Saves are sequential: one request at a time, always with the latest known revision. Edits
 *   made while a save is in flight are saved next, so an older request can never overwrite them.
 * - A revision conflict stops autosave until the user picks how to resolve it.
 */
import {
  type CharacterFacts,
  canonicalJson,
  createFieldResolver,
  type FieldConfig,
  type LibraryDefinitions,
  type LibraryFieldDefinition,
  type MigrationReviewItem,
} from "@/features/characters/domain";

import { draftToFact, type FieldDraft, factToDraft } from "./drafts";
import type { EditorErrors } from "./errors";
import { draftToLanguage, type LanguageDraft, languageToDraft } from "./language";
import { withOptional } from "./merge";
import {
  applyReviewDecisions,
  isReviewComplete,
  type ReviewDecision,
  type ReviewDecisions,
} from "./review";

export type SaveStatus = "idle" | "dirty" | "saving" | "saved" | "error" | "conflict";

export type ReviewState = {
  items: MigrationReviewItem[];
  decisions: ReviewDecisions;
  confirmed: boolean;
};

export type LoadedCharacter = {
  facts: CharacterFacts;
  revision: number;
  pendingMigration?: { fromVersion: number; review: MigrationReviewItem[] };
};

export type EditorState = {
  base: CharacterFacts;
  revision: number;
  working: CharacterFacts;
  dirty: boolean;
  /** Drafts of touched fields; untouched fields are derived from `working` on render. */
  drafts: Record<string, FieldDraft>;
  displayNameInput: string;
  language: LanguageDraft;
  /** Present while a migrated sheet still needs the user's review. */
  review: ReviewState | null;
  library: LibraryDefinitions;
  deprecatedLibraryKeys: string[];
  /** Library fields added to this character that have no value yet (kept visible). */
  addedLibraryKeys: string[];
  status: SaveStatus;
  /** The snapshot currently being saved. */
  saving: CharacterFacts | null;
  error: string | null;
  serverErrors: EditorErrors;
  savedAt: string | null;
};

export type EditorAction =
  | { type: "setField"; key: string; definition: FieldConfig; draft: FieldDraft }
  | { type: "setDisplayName"; input: string }
  | { type: "setLanguage"; draft: LanguageDraft }
  | { type: "updateFacts"; update: (facts: CharacterFacts) => CharacterFacts }
  | { type: "addLibraryDefinition"; definition: LibraryFieldDefinition }
  | { type: "showLibraryField"; key: string }
  | { type: "setReviewDecision"; id: string; decision: ReviewDecision }
  | { type: "confirmReview" }
  | { type: "saveStarted"; snapshot: CharacterFacts }
  | { type: "saveSucceeded"; snapshot: CharacterFacts; revision: number; savedAt: string }
  | { type: "saveFailed"; message: string; serverErrors?: EditorErrors }
  | { type: "conflict"; message: string }
  | { type: "loadLatest"; loaded: LoadedCharacter }
  | { type: "rebase"; loaded: LoadedCharacter; merged: CharacterFacts };

const same = (a: unknown, b: unknown) => canonicalJson(a) === canonicalJson(b);

function reviewOf(loaded: LoadedCharacter): ReviewState | null {
  const items = loaded.pendingMigration?.review ?? [];
  return items.length > 0 ? { items, decisions: {}, confirmed: false } : null;
}

export function createEditorState(
  loaded: LoadedCharacter,
  library: LibraryDefinitions,
  deprecatedLibraryKeys: readonly string[],
): EditorState {
  return {
    base: loaded.facts,
    revision: loaded.revision,
    working: loaded.facts,
    dirty: false,
    drafts: {},
    displayNameInput: loaded.facts.displayName,
    language: languageToDraft(loaded.facts.sourceLanguage),
    review: reviewOf(loaded),
    library,
    deprecatedLibraryKeys: [...deprecatedLibraryKeys],
    addedLibraryKeys: [],
    status: "idle",
    saving: null,
    error: null,
    serverErrors: {},
    savedAt: null,
  };
}

/** Whether autosave may run: nothing pending review, no unresolved conflict. */
export function canAutosave(state: EditorState): boolean {
  return state.status !== "conflict" && (state.review === null || state.review.confirmed);
}

/** The draft shown for a field: the touched draft, or one derived from the stored fact. */
export function draftOf(state: EditorState, key: string, definition: FieldConfig): FieldDraft {
  return state.drafts[key] ?? factToDraft(definition, state.working.values[key]);
}

/** Drop drafts that no longer describe `working` (their fact or definition changed). */
function pruneDrafts(
  drafts: Record<string, FieldDraft>,
  before: CharacterFacts,
  after: CharacterFacts,
): Record<string, FieldDraft> {
  const resolveBefore = createFieldResolver(before.custom);
  const resolveAfter = createFieldResolver(after.custom);
  const next: Record<string, FieldDraft> = {};
  for (const [key, draft] of Object.entries(drafts)) {
    const factChanged = !same(before.values[key], after.values[key]);
    const definitionChanged = !same(resolveBefore(key), resolveAfter(key));
    if (!factChanged && !definitionChanged) next[key] = draft;
  }
  return next;
}

/** Apply a new working sheet and derive the save status. */
function withWorking(state: EditorState, working: CharacterFacts): EditorState {
  const dirty = !same(working, state.base);
  const status: SaveStatus =
    state.status === "conflict" || state.status === "saving"
      ? state.status
      : dirty
        ? "dirty"
        : state.savedAt
          ? "saved"
          : "idle";
  return { ...state, working, dirty, status, serverErrors: {}, error: null };
}

export function editorReducer(state: EditorState, action: EditorAction): EditorState {
  switch (action.type) {
    case "setField": {
      const fact = draftToFact(action.definition, action.draft);
      const stored = state.base.values[action.key];
      const values = { ...state.working.values };
      // Unchanged content keeps the stored object (and its exact shape).
      if (fact === undefined) delete values[action.key];
      else values[action.key] = same(fact, stored) && stored ? stored : fact;
      return withWorking(
        { ...state, drafts: { ...state.drafts, [action.key]: action.draft } },
        { ...state.working, values },
      );
    }
    case "setDisplayName":
      return withWorking(
        { ...state, displayNameInput: action.input },
        { ...state.working, displayName: action.input.normalize("NFC").trim() },
      );
    case "setLanguage":
      return withWorking(
        { ...state, language: action.draft },
        withOptional(state.working, "sourceLanguage", draftToLanguage(action.draft)),
      );
    case "updateFacts": {
      const working = action.update(state.working);
      return withWorking(
        { ...state, drafts: pruneDrafts(state.drafts, state.working, working) },
        working,
      );
    }
    case "addLibraryDefinition": {
      const exists = state.library.fields.some((field) => field.key === action.definition.key);
      const library = {
        ...state.library,
        fields: exists
          ? state.library.fields.map((field) =>
              field.key === action.definition.key ? action.definition : field,
            )
          : [...state.library.fields, action.definition],
      };
      return { ...state, library };
    }
    case "showLibraryField":
      return state.addedLibraryKeys.includes(action.key)
        ? state
        : { ...state, addedLibraryKeys: [...state.addedLibraryKeys, action.key] };
    case "setReviewDecision":
      if (!state.review) return state;
      return {
        ...state,
        review: {
          ...state.review,
          decisions: { ...state.review.decisions, [action.id]: action.decision },
        },
      };
    case "confirmReview": {
      const review = state.review;
      if (!review || !isReviewComplete(review.items, review.decisions)) return state;
      const working = applyReviewDecisions(state.working, review.items, review.decisions);
      const next = withWorking(
        {
          ...state,
          drafts: pruneDrafts(state.drafts, state.working, working),
          review: { ...review, confirmed: true },
        },
        working,
      );
      // Confirming is itself a change to store: the sheet is written at the current version.
      return next.status === "idle" || next.status === "saved"
        ? { ...next, dirty: true, status: "dirty" }
        : { ...next, dirty: true };
    }
    case "saveStarted":
      return { ...state, status: "saving", saving: action.snapshot, error: null };
    case "saveSucceeded": {
      const changedSince = state.working !== action.snapshot;
      const conflict = state.status === "conflict";
      return {
        ...state,
        base: action.snapshot,
        revision: action.revision,
        saving: null,
        // The stored sheet is now at the current version: nothing is left to review.
        review: null,
        dirty: !same(state.working, action.snapshot),
        status: conflict ? "conflict" : changedSince ? "dirty" : "saved",
        savedAt: action.savedAt,
        error: null,
      };
    }
    case "saveFailed":
      return {
        ...state,
        saving: null,
        status: "error",
        error: action.message,
        serverErrors: action.serverErrors ?? {},
      };
    case "conflict":
      return { ...state, saving: null, status: "conflict", error: action.message };
    case "loadLatest":
      return {
        ...createEditorState(action.loaded, state.library, state.deprecatedLibraryKeys),
        addedLibraryKeys: state.addedLibraryKeys,
      };
    case "rebase": {
      const { loaded, merged } = action;
      const drafts = pruneDrafts(state.drafts, state.working, merged);
      const displayNameInput =
        merged.displayName === state.working.displayName
          ? state.displayNameInput
          : merged.displayName;
      const language =
        merged.sourceLanguage === state.working.sourceLanguage
          ? state.language
          : languageToDraft(merged.sourceLanguage);
      const dirty = !same(merged, loaded.facts);
      return {
        ...state,
        base: loaded.facts,
        revision: loaded.revision,
        working: merged,
        dirty,
        drafts,
        displayNameInput,
        language,
        review: state.review?.confirmed ? state.review : reviewOf(loaded),
        status: dirty ? "dirty" : "saved",
        saving: null,
        error: null,
        serverErrors: {},
      };
    }
  }
}
