import { describe, expect, it } from "vitest";

import {
  type CharacterFacts,
  type CustomFieldDefinition,
  createFieldResolver,
  fieldScopeOf,
  findBreakingChanges,
  type LibraryDefinitions,
  type LibraryFieldDefinition,
  parseCharacterFacts,
  parseLibraryDefinitions,
} from "../domain";

import {
  sampleContemporary,
  sampleContext,
  sampleFantasy,
  sampleLibrary,
} from "./fixtures/sample-characters";

function paths(result: ReturnType<typeof parseCharacterFacts>): string[] {
  return result.success ? [] : result.error.issues.map((issue) => issue.path.join("."));
}

const zodiacDefinition = sampleLibrary.fields.find((field) => field.key === "lib.zodiac")!;
if (zodiacDefinition.kind !== "single_select") throw new Error("fixture changed");
const zodiac = zodiacDefinition;

function libraryWith(
  fields: LibraryFieldDefinition[],
  groups = sampleLibrary.groups,
): LibraryDefinitions {
  return { groups, fields };
}

describe("scopes and resolution (Q1)", () => {
  it("derives the scope from the key prefix", () => {
    expect(fieldScopeOf("identity.age")).toBe("builtin");
    expect(fieldScopeOf("custom.spells")).toBe("character");
    expect(fieldScopeOf("lib.zodiac")).toBe("library");
  });

  it("resolves each key only in its own scope", () => {
    const resolve = createFieldResolver(sampleFantasy.custom, sampleContext);
    expect(resolve("identity.age")?.kind).toBe("measure");
    expect(resolve("custom.spells")?.kind).toBe("object_list");
    expect(resolve("lib.zodiac")?.kind).toBe("single_select");
    // A character-scoped resolver does not see library fields without context.
    expect(createFieldResolver(sampleFantasy.custom)("lib.zodiac")).toBeUndefined();
  });

  it("validates library-scoped values when definitions are passed in", () => {
    expect(paths(parseCharacterFacts(sampleContemporary, sampleContext))).toEqual([]);
  });

  it("reports library values as unresolved when no definitions are passed", () => {
    const result = parseCharacterFacts(sampleContemporary);
    expect(paths(result)).toEqual(
      expect.arrayContaining(["values.lib.zodiac", "values.lib.secret"]),
    );
    expect(result.error?.issues[0]?.message).toContain("định nghĩa dùng chung");
  });

  it("validates library values against the library definition", () => {
    const facts: CharacterFacts = {
      ...sampleContemporary,
      values: {
        ...sampleContemporary.values,
        "lib.zodiac": { state: "specified", value: { option: "dragon" } },
      },
    };
    expect(paths(parseCharacterFacts(facts, sampleContext))).toContain(
      "values.lib.zodiac.value.option",
    );
  });

  it("does not let character custom definitions claim library keys", () => {
    const hijack = { ...zodiac, key: "lib.zodiac" } as unknown as CustomFieldDefinition;
    const facts = { ...sampleFantasy, custom: { ...sampleFantasy.custom!, fields: [hijack] } };
    expect(paths(parseCharacterFacts(facts, sampleContext))).toContain("custom.fields.0.key");
  });

  it("lets character fields sit in library groups only when the library is known", () => {
    const field: CustomFieldDefinition = {
      key: "custom.home_realm",
      group: "lg_worldbuilding",
      label: "Cõi giới",
      kind: "short_text",
    };
    const facts = {
      ...sampleFantasy,
      custom: { ...sampleFantasy.custom!, fields: [...sampleFantasy.custom!.fields, field] },
    };
    expect(paths(parseCharacterFacts(facts, sampleContext))).toEqual([]);
    expect(paths(parseCharacterFacts(facts))).toContain(
      `custom.fields.${facts.custom.fields.length - 1}.group`,
    );
  });
});

describe("library definitions", () => {
  it("accepts the sample library", () => {
    expect(parseLibraryDefinitions(sampleLibrary).success).toBe(true);
  });

  it("requires lib./lg_ namespaces and a version", () => {
    const bad = {
      groups: [{ id: "cg_wrong_scope", label: "Sai phạm vi" }],
      fields: [
        { ...zodiac, key: "custom.zodiac" },
        { ...zodiac, key: "lib.no_version", version: undefined },
      ],
    };
    const result = parseLibraryDefinitions(bad);
    const issuePaths = result.success
      ? []
      : result.error.issues.map((issue) => issue.path.join("."));
    expect(issuePaths).toEqual(
      expect.arrayContaining(["groups.0.id", "fields.0.key", "fields.1.version"]),
    );
  });

  it("rejects duplicate keys so one key never means two definitions", () => {
    const result = parseLibraryDefinitions(libraryWith([zodiac, { ...zodiac, label: "Khác" }]));
    expect(result.success).toBe(false);
  });

  it("cannot place library fields in a character's group", () => {
    const result = parseLibraryDefinitions(libraryWith([{ ...zodiac, group: "cg_magic" }]));
    expect(result.success).toBe(false);
  });
});

describe("definition edits (Q1 compatibility)", () => {
  const select: CustomFieldDefinition = {
    key: "custom.mood",
    group: "personality",
    label: "Tâm trạng",
    kind: "single_select",
    options: [
      { code: "calm", label: "Điềm tĩnh" },
      { code: "angry", label: "Nóng nảy" },
    ],
  };

  it("treats presentation and widening edits as compatible", () => {
    expect(
      findBreakingChanges(select, { ...select, label: "Khí chất", group: "behavior" }),
    ).toEqual([]);
    expect(
      findBreakingChanges(select, {
        ...select,
        options: [...select.options, { code: "sad", label: "Buồn" }],
      }),
    ).toEqual([]);
    expect(
      findBreakingChanges(select, { ...select, allowOther: true, sensitivity: "sensitive" }),
    ).toEqual([]);
  });

  it("flags edits that could invalidate stored values", () => {
    expect(findBreakingChanges(select, { ...select, kind: "short_text" } as never)).toEqual([
      { path: "kind", reason: "kind_changed" },
    ]);
    expect(findBreakingChanges(select, { ...select, options: [select.options[0]!] })).toEqual([
      { path: "options.angry", reason: "option_removed" },
    ]);
    expect(findBreakingChanges({ ...select, allowOther: true }, select)).toEqual([
      { path: "allowOther", reason: "other_disallowed" },
    ]);
    expect(findBreakingChanges({ ...select, allowExplicitNone: true }, select)).toEqual([
      { path: "allowExplicitNone", reason: "explicit_none_disallowed" },
    ]);
  });

  it("flags narrowed numbers and units", () => {
    const height = { kind: "measure", units: ["cm", "m"], min: 0 } as const;
    expect(findBreakingChanges(height, { ...height, units: ["cm"] })).toEqual([
      { path: "units.m", reason: "unit_removed" },
    ]);
    expect(findBreakingChanges(height, { ...height, max: 300 })).toEqual([
      { path: "max", reason: "range_narrowed" },
    ]);
    expect(findBreakingChanges({ kind: "number" }, { kind: "number", integer: true })).toEqual([
      { path: "integer", reason: "integer_required" },
    ]);
    expect(findBreakingChanges({ kind: "number", min: 5 }, { kind: "number", min: 0 })).toEqual([]);
  });

  it("checks sub-fields of object lists", () => {
    const spells = sampleFantasy.custom!.fields.find((field) => field.key === "custom.spells")!;
    if (spells.kind !== "object_list") throw new Error("fixture changed");
    const [name, cost, ...rest] = spells.fields;
    expect(findBreakingChanges(spells, { ...spells, fields: [name!, ...rest] })).toEqual([
      { path: "fields.cost", reason: "subfield_removed" },
    ]);
    expect(
      findBreakingChanges(spells, {
        ...spells,
        fields: [name!, { ...cost!, required: true }, ...rest],
      }),
    ).toEqual([{ path: "fields.cost.required", reason: "subfield_now_required" }]);
    expect(
      findBreakingChanges(spells, {
        ...spells,
        fields: [
          ...spells.fields,
          { key: "school", label: "Trường phái", kind: "short_text", required: true },
        ],
      }),
    ).toEqual([{ path: "fields.school.required", reason: "subfield_now_required" }]);
    expect(
      findBreakingChanges(spells, {
        ...spells,
        fields: [...spells.fields, { key: "school", label: "Trường phái", kind: "short_text" }],
      }),
    ).toEqual([]);
    expect(findBreakingChanges(spells, { ...spells, maxItems: 1 })).toEqual([
      { path: "maxItems", reason: "max_items_lowered" },
    ]);
  });

  it("keeps existing values valid after a compatible library edit", () => {
    const edited = libraryWith([
      {
        ...zodiac,
        version: 3,
        label: "Tuổi âm lịch",
        options: [...zodiac.options, { code: "dragon", label: "Thìn" }],
      },
      ...sampleLibrary.fields.filter((field) => field.key !== "lib.zodiac"),
    ] as LibraryFieldDefinition[]);
    expect(findBreakingChanges(zodiac, edited.fields[0]!)).toEqual([]);
    expect(paths(parseCharacterFacts(sampleContemporary, { library: edited }))).toEqual([]);
  });

  it("reports (never drops) values made invalid by an incompatible edit", () => {
    const narrowed = libraryWith([
      { ...zodiac, version: 3, options: zodiac.options.filter((option) => option.code !== "cat") },
      ...sampleLibrary.fields.filter((field) => field.key !== "lib.zodiac"),
    ] as LibraryFieldDefinition[]);
    const result = parseCharacterFacts(sampleContemporary, { library: narrowed });
    expect(paths(result)).toContain("values.lib.zodiac.value.option");
    expect(sampleContemporary.values["lib.zodiac"]).toEqual({
      state: "specified",
      value: { option: "cat" },
    });
  });
});
