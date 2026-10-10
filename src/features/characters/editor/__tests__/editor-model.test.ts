import { describe, expect, it } from "vitest";

import {
  type CharacterFacts,
  CHARACTER_FACTS_SCHEMA_VERSION,
  getBuiltinField,
  type LibraryDefinitions,
} from "@/features/characters/domain";

import {
  canRemoveCustomGroup,
  definitionToDraft,
  draftToDefinition,
  emptyDefinitionDraft,
  moveCustomField,
  removeCustomField,
  upsertCustomField,
  validateCustomDefinition,
  validateLibraryDefinition,
} from "../custom-fields";
import { factToDraft } from "../drafts";
import { createEditorState, editorReducer } from "../editor-state";
import { errorKeys } from "../errors";
import { draftToLanguage, languageToDraft, LANGUAGE_OTHER } from "../language";
import { buildEditorGroups, fieldsOfGroup, visibilityOf } from "../layout";
import { mergeOntoLatest } from "../merge";
import { applyReviewDecisions, isReviewComplete, reviewChoices } from "../review";
import { validateSheet } from "../validate";

const EMPTY_LIBRARY: LibraryDefinitions = { groups: [], fields: [] };

function sheet(values: CharacterFacts["values"] = {}, extra: Partial<CharacterFacts> = {}) {
  return {
    schemaVersion: CHARACTER_FACTS_SCHEMA_VERSION,
    displayName: "Vân",
    values,
    ...extra,
  } as CharacterFacts;
}

describe("layout", () => {
  it("builds the nine built-in groups from definitions, with sub-groups", () => {
    const groups = buildEditorGroups({
      custom: undefined,
      library: EMPTY_LIBRARY,
      deprecatedLibraryKeys: new Set(),
    });
    expect(groups.map((group) => group.id)).toEqual([
      "identity",
      "appearance",
      "personality",
      "psychology",
      "behavior",
      "background",
      "lifestyle",
      "history",
      "relationships",
    ]);
    expect(groups[1]!.subgroups.map((group) => group.id)).toContain("appearance.hair");
    const fields = groups.flatMap(fieldsOfGroup);
    // 85 active built-in fields plus three retired ones (v1 gender; given/family name, TASK 10).
    expect(fields.filter((field) => !field.deprecated)).toHaveLength(85);
    expect(fields.filter((field) => field.deprecated).map((field) => field.key)).toEqual([
      "identity.given_name",
      "identity.family_name",
      "identity.gender",
    ]);
  });

  it("shows 31 fields in basic mode and flags hidden fields that hold data", () => {
    const groups = buildEditorGroups({
      custom: undefined,
      library: EMPTY_LIBRARY,
      deprecatedLibraryKeys: new Set(),
    });
    const facts = sheet({ "identity.apparent_age": { state: "specified", value: "20" } });
    const fields = groups.flatMap(fieldsOfGroup);
    const input = { facts, library: EMPTY_LIBRARY, addedLibraryKeys: [] };
    const basic = fields.filter(
      (field) => visibilityOf(field, { ...input, mode: "basic" }) === "visible",
    );
    expect(basic).toHaveLength(31);
    const apparentAge = fields.find((field) => field.key === "identity.apparent_age")!;
    expect(visibilityOf(apparentAge, { ...input, mode: "basic" })).toBe("hidden_with_data");
    expect(visibilityOf(apparentAge, { ...input, mode: "advanced" })).toBe("visible");
  });

  it("no longer offers given/family name, but keeps stored values (TASK 10)", () => {
    const groups = buildEditorGroups({
      custom: undefined,
      library: EMPTY_LIBRARY,
      deprecatedLibraryKeys: new Set(),
    });
    const fields = groups.flatMap(fieldsOfGroup);
    const empty = { facts: sheet({}), library: EMPTY_LIBRARY, addedLibraryKeys: [] };
    for (const key of ["identity.given_name", "identity.family_name"]) {
      const field = fields.find((candidate) => candidate.key === key)!;
      expect(field.deprecated).toBe(true);
      for (const mode of ["basic", "advanced"] as const) {
        expect(visibilityOf(field, { ...empty, mode })).toBe("hidden");
      }
      // Stored data is still reported, so the editor shows it read-only instead of losing it.
      const stored = { ...empty, facts: sheet({ [key]: { state: "specified", value: "Vân" } }) };
      expect(visibilityOf(field, { ...stored, mode: "advanced" })).toBe("hidden_with_data");
    }
    const fullName = fields.find((field) => field.key === "identity.full_name")!;
    expect(visibilityOf(fullName, { ...empty, mode: "basic" })).toBe("visible");
  });
});

describe("editor state", () => {
  const nickname = getBuiltinField("identity.nicknames")!;

  it("only rewrites touched fields and tracks dirtiness", () => {
    const stored = sheet({
      "identity.nationality": { state: "not_applicable" },
      "identity.full_name": { state: "specified", value: "Cũ" },
    });
    let state = createEditorState({ facts: stored, revision: 1 }, EMPTY_LIBRARY, []);
    state = editorReducer(state, {
      type: "setField",
      key: "identity.nicknames",
      definition: nickname,
      draft: {
        ...factToDraft(nickname, undefined),
        value: { kind: "text_list", items: [{ id: "n1", text: "Mây" }] },
      },
    });
    expect(state.dirty).toBe(true);
    expect(state.status).toBe("dirty");
    expect(state.working.values["identity.nationality"]).toBe(
      stored.values["identity.nationality"],
    );
    expect(state.working.values["identity.full_name"]).toBe(stored.values["identity.full_name"]);
  });

  it("marks edits made during a save as still dirty after it succeeds", () => {
    let state = createEditorState({ facts: sheet(), revision: 1 }, EMPTY_LIBRARY, []);
    state = editorReducer(state, { type: "setDisplayName", input: "Vân 2" });
    const snapshot = state.working;
    state = editorReducer(state, { type: "saveStarted", snapshot });
    state = editorReducer(state, { type: "setDisplayName", input: "Vân 3" });
    expect(state.status).toBe("saving");
    state = editorReducer(state, {
      type: "saveSucceeded",
      snapshot,
      revision: 2,
      savedAt: "2026-01-01T00:00:00Z",
    });
    expect(state.revision).toBe(2);
    expect(state.status).toBe("dirty");
    expect(state.base.displayName).toBe("Vân 2");
  });

  it("keeps the conflict until resolved and does not mark a failed save as saved", () => {
    let state = createEditorState({ facts: sheet(), revision: 1 }, EMPTY_LIBRARY, []);
    state = editorReducer(state, { type: "setDisplayName", input: "Khác" });
    state = editorReducer(state, { type: "saveStarted", snapshot: state.working });
    state = editorReducer(state, { type: "conflict", message: "x" });
    state = editorReducer(state, { type: "setDisplayName", input: "Khác nữa" });
    expect(state.status).toBe("conflict");
    state = editorReducer(state, { type: "saveFailed", message: "offline" });
    expect(state.status).toBe("error");
    expect(state.savedAt).toBeNull();
  });

  it("requires a confirmed review before saving a migrated sheet", () => {
    let state = createEditorState(
      {
        facts: sheet({ "identity.family_name": { state: "not_applicable" } }),
        revision: 1,
        pendingMigration: {
          fromVersion: 1,
          review: [{ key: "identity.family_name", reason: "not_applicable_may_mean_none" }],
        },
      },
      EMPTY_LIBRARY,
      [],
    );
    state = editorReducer(state, { type: "confirmReview" });
    expect(state.review?.confirmed).toBe(false);
    state = editorReducer(state, {
      type: "setReviewDecision",
      id: "identity.family_name:not_applicable_may_mean_none",
      decision: "explicit_none",
    });
    state = editorReducer(state, { type: "confirmReview" });
    expect(state.review?.confirmed).toBe(true);
    expect(state.working.values["identity.family_name"]).toEqual({ state: "explicit_none" });
    expect(state.status).toBe("dirty");
  });
});

describe("review", () => {
  const items = [
    { key: "identity.gender", reason: "ambiguous_gender" as const },
    { key: "identity.family_name", reason: "not_applicable_may_mean_none" as const },
  ];
  const facts = sheet({
    "identity.gender": { state: "specified", value: { option: "female" } },
    "identity.family_name": { state: "not_applicable" },
  });

  it("offers explicit_none only where the field allows it", () => {
    expect(reviewChoices(items[0]!, facts, {})).toEqual(["keep", "clear"]);
    expect(reviewChoices(items[1]!, facts, {})).toEqual(["keep", "explicit_none", "clear"]);
  });

  it("applies only explicit decisions and never guesses", () => {
    expect(isReviewComplete(items, { "identity.gender:ambiguous_gender": "keep" })).toBe(false);
    expect(() => applyReviewDecisions(facts, items, {})).toThrow();
    const result = applyReviewDecisions(facts, items, {
      "identity.gender:ambiguous_gender": "keep",
      "identity.family_name:not_applicable_may_mean_none": "keep",
    });
    expect(result.values).toEqual(facts.values);
  });

  it("does not undo a change the user already made in the form", () => {
    const edited = sheet({ "identity.family_name": { state: "specified", value: "Trần" } });
    const result = applyReviewDecisions(edited, [items[1]!], {
      "identity.family_name:not_applicable_may_mean_none": "clear",
    });
    expect(result.values["identity.family_name"]).toEqual({ state: "specified", value: "Trần" });
  });
});

describe("merge", () => {
  it("re-applies local changes on the latest sheet and reports overlaps", () => {
    const base = sheet({ "identity.full_name": { state: "specified", value: "A" } });
    const local = sheet({
      "identity.full_name": { state: "specified", value: "B" },
      "identity.pronouns": { state: "specified", value: "cô ấy" },
    });
    const latest = sheet({
      "identity.full_name": { state: "specified", value: "C" },
      "identity.species": { state: "specified", value: "Rồng" },
    });
    const result = mergeOntoLatest(base, local, latest);
    expect(result.overlapping).toEqual(["identity.full_name"]);
    expect(result.merged.values).toEqual({
      "identity.full_name": { state: "specified", value: "B" },
      "identity.pronouns": { state: "specified", value: "cô ấy" },
      "identity.species": { state: "specified", value: "Rồng" },
    });
  });

  it("does not report identical changes as overlaps, and handles removals", () => {
    const base = sheet(
      { "identity.full_name": { state: "specified", value: "A" } },
      { sourceLanguage: "vi" },
    );
    const local = sheet({}, { sourceLanguage: "en" });
    const latest = sheet({}, { sourceLanguage: "vi" });
    const result = mergeOntoLatest(base, local, latest);
    expect(result.overlapping).toEqual([]);
    expect(result.merged.sourceLanguage).toBe("en");
    expect(result.merged.values).toEqual({});
  });
});

describe("validation messages", () => {
  it("places value errors on the field, item and sub-field, in Vietnamese", () => {
    const facts = sheet({
      "appearance.height": { state: "specified", value: { value: Number.NaN, unit: "cm" } },
      "identity.nicknames": { state: "specified", value: [{ id: "n1", text: "x".repeat(400) }] },
      "relationships.entries": {
        state: "specified",
        value: [{ id: "r1", notes: "Không có người" }],
      },
    });
    const errors = validateSheet(facts, EMPTY_LIBRARY);
    expect(errors["appearance.height"]).toBe("Hãy nhập một số hợp lệ.");
    expect(errors[errorKeys.item("identity.nicknames", "n1")]).toMatch(/Tối đa 300/);
    expect(errors[errorKeys.subfield("relationships.entries", "person", "r1")]).toBe(
      "Trường này là bắt buộc.",
    );
  });

  it("accepts a valid sheet", () => {
    expect(
      validateSheet(
        sheet({ "identity.age": { state: "specified", value: { value: 0, unit: "years" } } }),
        EMPTY_LIBRARY,
      ),
    ).toEqual({});
  });
});

describe("source language", () => {
  it("normalises tags and keeps unknown as absent", () => {
    expect(draftToLanguage(languageToDraft(undefined))).toBeUndefined();
    expect(draftToLanguage({ choice: LANGUAGE_OTHER, other: "en-us" })).toBe("en-US");
    expect(languageToDraft("pt-BR")).toEqual({ choice: LANGUAGE_OTHER, other: "pt-BR" });
    expect(
      validateSheet(sheet({}, { sourceLanguage: "không hợp lệ" }), EMPTY_LIBRARY).sourceLanguage,
    ).toBeDefined();
  });
});

describe("custom fields", () => {
  it("creates, edits, reorders and removes character-scoped fields with stable keys", () => {
    const draft = { ...emptyDefinitionDraft("identity"), label: "Món ăn yêu thích" };
    const first = draftToDefinition(draft, "custom.food0001");
    const second = draftToDefinition({ ...draft, label: "Màu yêu thích" }, "custom.color001");
    let facts = upsertCustomField(upsertCustomField(sheet(), first), second);
    expect(validateCustomDefinition(facts, first, EMPTY_LIBRARY)).toEqual({});
    facts = moveCustomField(facts, "custom.color001", -1);
    expect(facts.custom!.fields.map((field) => field.key)).toEqual([
      "custom.color001",
      "custom.food0001",
    ]);

    const renamed = draftToDefinition(
      { ...definitionToDraft(first), label: "Món ruột" },
      first.key,
    );
    facts = upsertCustomField(
      { ...facts, values: { [first.key]: { state: "specified", value: "Phở" } } },
      renamed,
    );
    expect(facts.values[first.key]).toEqual({ state: "specified", value: "Phở" });

    facts = removeCustomField(removeCustomField(facts, first.key), second.key);
    expect(facts.custom).toBeUndefined();
    expect(facts.values).toEqual({});
  });

  it("reports missing labels and option labels next to the inputs", () => {
    const definition = draftToDefinition(
      {
        ...emptyDefinitionDraft("identity"),
        kind: "single_select",
        options: [{ code: "oa", label: "" }],
      },
      "custom.select01",
    );
    const errors = validateCustomDefinition(sheet(), definition, EMPTY_LIBRARY);
    expect(errors.label).toBeDefined();
    expect(errors["options.0"]).toBeDefined();
  });

  it("does not place library fields in a character's own groups", () => {
    const definition = {
      ...draftToDefinition(
        { ...emptyDefinitionDraft("cg_mine0001"), label: "Cung" },
        "lib.zodiac01",
      ),
      version: 1,
    };
    expect(validateLibraryDefinition(EMPTY_LIBRARY, definition).group).toBeDefined();
  });

  it("only removes empty groups", () => {
    const facts = upsertCustomField(
      sheet({}, { custom: { groups: [{ id: "cg_world001", label: "Thế giới" }], fields: [] } }),
      draftToDefinition(
        { ...emptyDefinitionDraft("cg_world001"), label: "Quê" },
        "custom.home0001",
      ),
    );
    expect(canRemoveCustomGroup(facts, EMPTY_LIBRARY, "cg_world001")).toBe(false);
  });
});
