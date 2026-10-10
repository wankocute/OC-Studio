import { describe, expect, it } from "vitest";

import {
  BUILTIN_FIELDS,
  type FactValue,
  type FieldConfig,
  getBuiltinField,
  parseCharacterFacts,
} from "@/features/characters/domain";

import {
  draftToFact,
  emptyObjectItem,
  factToDraft,
  type FieldDraft,
  OTHER_CHOICE,
  parseNumberInput,
} from "../drafts";

const def = (key: string) => getBuiltinField(key)! as FieldConfig;

const roundTrip = (key: string, fact: FactValue) =>
  draftToFact(def(key), factToDraft(def(key), fact));

describe("drafts ⇄ facts", () => {
  it.each([
    ["identity.full_name", { state: "specified", value: "Lâm Thanh Vân" }],
    ["identity.age", { state: "specified", value: { value: 0, unit: "years", approximate: true } }],
    ["identity.birth_date", { state: "specified", value: { type: "calendar", month: 3, day: 14 } }],
    [
      "identity.birth_date",
      { state: "specified", value: { type: "text", text: "Mùa đông năm ấy" } },
    ],
    ["identity.gender_identity", { state: "specified", value: { other: "Linh hồn gió" } }],
    ["behavior.speech_pace", { state: "specified", value: { option: "slow" } }],
    [
      "identity.nicknames",
      {
        state: "specified",
        value: [
          { id: "a1", text: "Vân" },
          { id: "b2", text: "Mây" },
        ],
        sensitiveItemIds: ["b2"],
      },
    ],
    [
      "relationships.entries",
      {
        state: "specified",
        value: [
          {
            id: "rel_1",
            person: {
              type: "unlinked",
              name: "Bà ngoại",
              detachedFrom: {
                characterId: "8d0c3a8e-6f2b-4d55-9a9b-0c4a3f6b1e21",
                reason: "character_deleted",
                at: "2026-01-01T00:00:00.000Z",
              },
            },
            type: { option: "family" },
          },
        ],
      },
    ],
    ["identity.family_name", { state: "explicit_none" }],
    ["identity.nationality", { state: "not_applicable" }],
  ] as [string, FactValue][])("round-trips %s without changing the stored fact", (key, fact) => {
    expect(roundTrip(key, fact)).toEqual(fact);
  });

  it("covers every built-in field kind", () => {
    const kinds = new Set(BUILTIN_FIELDS.map((field) => field.kind));
    for (const field of BUILTIN_FIELDS) {
      expect(() => factToDraft(field, undefined)).not.toThrow();
      expect(draftToFact(field, factToDraft(field, undefined))).toBeUndefined();
    }
    expect(kinds.size).toBeGreaterThanOrEqual(7);
  });

  it("keeps 0 and false as values, never as unspecified", () => {
    const age = factToDraft(def("identity.age"), undefined);
    expect(
      draftToFact(def("identity.age"), {
        ...age,
        value: { kind: "measure", value: "0", unit: "years", approximate: false },
      }),
    ).toEqual({ state: "specified", value: { value: 0, unit: "years" } });
    const boolean: FieldConfig = { kind: "boolean" };
    expect(
      draftToFact(boolean, {
        state: "value",
        value: { kind: "boolean", value: false },
        sensitiveItemIds: [],
      }),
    ).toEqual({ state: "specified", value: false });
  });

  it("turns blanks into unspecified, never into explicit_none", () => {
    const draft = factToDraft(def("identity.nicknames"), undefined);
    const blank: FieldDraft = {
      ...draft,
      value: { kind: "text_list", items: [{ id: "x", text: "   " }] },
      sensitiveItemIds: ["x"],
    };
    expect(draftToFact(def("identity.nicknames"), blank)).toBeUndefined();
    expect(
      draftToFact(def("identity.full_name"), {
        state: "value",
        value: { kind: "short_text", text: "" },
        sensitiveItemIds: [],
      }),
    ).toBeUndefined();
  });

  it("keeps the typed value when another state is chosen", () => {
    const draft: FieldDraft = {
      state: "not_applicable",
      value: { kind: "short_text", text: "Việt Nam" },
      sensitiveItemIds: [],
    };
    expect(draftToFact(def("identity.nationality"), draft)).toEqual({ state: "not_applicable" });
    expect(draftToFact(def("identity.nationality"), { ...draft, state: "value" })).toEqual({
      state: "specified",
      value: "Việt Nam",
    });
  });

  it("drops sensitivity marks of removed or blank items only", () => {
    const fact = draftToFact(def("identity.nicknames"), {
      state: "value",
      value: {
        kind: "text_list",
        items: [
          { id: "keep", text: "Vân" },
          { id: "blank", text: "" },
        ],
      },
      sensitiveItemIds: ["gone", "keep", "blank"],
    });
    expect(fact).toEqual({
      state: "specified",
      value: [{ id: "keep", text: "Vân" }],
      sensitiveItemIds: ["keep"],
    });
  });

  it("keeps invalid numbers so validation can report them", () => {
    expect(parseNumberInput("1,5")).toBe(1.5);
    expect(parseNumberInput("  ")).toBeUndefined();
    expect(parseNumberInput("abc")).toBeNaN();
    const fact = draftToFact(def("appearance.height"), {
      state: "value",
      value: { kind: "measure", value: "abc", unit: "cm", approximate: false },
      sensitiveItemIds: [],
    });
    expect(fact?.state).toBe("specified");
    const sheet = { schemaVersion: 3, displayName: "A", values: { "appearance.height": fact } };
    expect(parseCharacterFacts(sheet).success).toBe(false);
  });

  it("builds object-list items with the given stable id and a blank 'other' answer", () => {
    const definition = def("lifestyle.skills");
    if (definition.kind !== "object_list") throw new Error("fixture");
    const item = emptyObjectItem(definition, "skill_1");
    expect(item.id).toBe("skill_1");
    expect(Object.keys(item.fields)).toEqual(["name", "proficiency", "note"]);
    const select = factToDraft(def("behavior.speech_pace"), {
      state: "specified",
      value: { other: "Lúc nhanh lúc chậm" },
    });
    expect(select.value).toEqual({
      kind: "single_select",
      choice: OTHER_CHOICE,
      other: "Lúc nhanh lúc chậm",
    });
  });
});
