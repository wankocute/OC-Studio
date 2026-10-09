import { describe, expect, it } from "vitest";

import {
  type CharacterFacts,
  type CustomFieldDefinition,
  type FactValue,
  parseCharacterFacts,
} from "../domain";

import {
  SAMPLE_CHARACTER_IDS,
  sampleCharacters,
  sampleContemporary,
  sampleFantasy,
  sampleMinimal,
} from "./fixtures/sample-characters";

function sheet(values: Record<string, unknown>, extra: Partial<CharacterFacts> = {}): unknown {
  return { schemaVersion: 1, displayName: "Thử nghiệm", values, ...extra };
}

function specified(value: unknown) {
  return { state: "specified", value };
}

/** Paths of all issues, joined with "." for easy assertions. */
function issuePaths(input: unknown): string[] {
  const result = parseCharacterFacts(input);
  return result.success ? [] : result.error.issues.map((issue) => issue.path.join("."));
}

function expectValid(input: unknown) {
  const result = parseCharacterFacts(input);
  expect(result.success ? [] : result.error.issues).toEqual([]);
}

function expectInvalidAt(input: unknown, path: string) {
  expect(issuePaths(input)).toContain(path);
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object") {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

describe("sample characters", () => {
  it.each(Object.entries(sampleCharacters))("%s sample is valid", (_, character) => {
    expectValid(character);
  });

  it("accepts a sheet with only a display name", () => {
    expectValid(sheet({}));
  });

  it("accepts the minimal sample with almost every field unspecified", () => {
    expect(Object.keys(sampleMinimal.values)).toHaveLength(2);
    expectValid(sampleMinimal);
  });

  it("accepts the fantasy sample with not_applicable fields and custom facts", () => {
    expect(sampleFantasy.values["identity.nationality"]).toEqual({ state: "not_applicable" });
    expect(sampleFantasy.custom?.fields.length).toBeGreaterThan(0);
    expectValid(sampleFantasy);
  });
});

describe("display name", () => {
  it("is required and cannot be blank", () => {
    expectInvalidAt({ schemaVersion: 1, values: {} }, "displayName");
    expectInvalidAt(sheet({}, { displayName: "   " }), "displayName");
  });

  it("rejects an unknown schema version", () => {
    expectInvalidAt({ schemaVersion: 2, displayName: "A", values: {} }, "schemaVersion");
  });
});

describe("fact states", () => {
  it("accepts specified and not_applicable; unspecified is the absent key", () => {
    expectValid(sheet({ "identity.nationality": { state: "not_applicable" } }));
    expectValid(sheet({ "identity.nationality": specified("Việt Nam") }));
    expectValid(sheet({}));
  });

  it("does not store an explicit unspecified state", () => {
    expectInvalidAt(
      sheet({ "identity.nationality": { state: "unspecified" } }),
      "values.identity.nationality.state",
    );
  });

  it("rejects specified without a value, or with empty / null values", () => {
    expectInvalidAt(
      sheet({ "identity.nationality": { state: "specified" } }),
      "values.identity.nationality.value",
    );
    expectInvalidAt(
      sheet({ "identity.nationality": specified("") }),
      "values.identity.nationality.value",
    );
    expectInvalidAt(
      sheet({ "identity.nationality": specified("   ") }),
      "values.identity.nationality.value",
    );
    expectInvalidAt(
      sheet({ "identity.nationality": specified(null) }),
      "values.identity.nationality.value",
    );
    expectInvalidAt(
      sheet({ "identity.nicknames": specified([]) }),
      "values.identity.nicknames.value",
    );
  });

  it("does not allow a value next to not_applicable", () => {
    expectInvalidAt(
      sheet({ "identity.nationality": { state: "not_applicable", value: "x" } }),
      "values.identity.nationality",
    );
  });

  it("rejects facts for fields that do not exist", () => {
    expectInvalidAt(
      sheet({ "identity.favorite_color": specified("đỏ") }),
      "values.identity.favorite_color",
    );
    expectInvalidAt(sheet({ "Họ tên": specified("x") }), "values.Họ tên");
  });
});

describe("numbers and measures", () => {
  it("rejects numbers given as strings", () => {
    expectInvalidAt(
      sheet({ "identity.age": specified({ value: "27", unit: "years" }) }),
      "values.identity.age.value.value",
    );
  });

  it("rejects NaN and Infinity", () => {
    expectInvalidAt(
      sheet({ "identity.age": specified({ value: Number.NaN, unit: "years" }) }),
      "values.identity.age.value.value",
    );
    expectInvalidAt(
      sheet({ "appearance.height": specified({ value: Infinity, unit: "cm" }) }),
      "values.appearance.height.value.value",
    );
  });

  it("enforces allowed units and minimums", () => {
    expectInvalidAt(
      sheet({ "appearance.height": specified({ value: 170, unit: "kg" }) }),
      "values.appearance.height.value.unit",
    );
    expectInvalidAt(
      sheet({ "identity.age": specified({ value: -1, unit: "years" }) }),
      "values.identity.age.value.value",
    );
  });

  it("accepts approximate measures", () => {
    expectValid(
      sheet({ "appearance.weight": specified({ value: 60, unit: "kg", approximate: true }) }),
    );
  });
});

describe("lists and nested objects", () => {
  it("requires unique stable ids within a list", () => {
    expectInvalidAt(
      sheet({
        "personality.likes": specified([
          { id: "a", text: "Mưa" },
          { id: "a", text: "Nắng" },
        ]),
      }),
      "values.personality.likes.value.1.id",
    );
  });

  it("requires every repeated element to have a valid id", () => {
    expectInvalidAt(
      sheet({ "personality.likes": specified([{ text: "Mưa" }]) }),
      "values.personality.likes.value.0.id",
    );
    expectInvalidAt(
      sheet({ "personality.likes": specified([{ id: "có dấu", text: "Mưa" }]) }),
      "values.personality.likes.value.0.id",
    );
  });

  it("rejects blank list items", () => {
    expectInvalidAt(
      sheet({ "personality.likes": specified([{ id: "a", text: " " }]) }),
      "values.personality.likes.value.0.text",
    );
  });

  it("rejects object items with no facts besides the id", () => {
    expectInvalidAt(
      sheet({ "appearance.tattoos": specified([{ id: "t1" }]) }),
      "values.appearance.tattoos.value.0",
    );
  });

  it("enforces required sub-fields", () => {
    expectInvalidAt(
      sheet({ "relationships.entries": specified([{ id: "r1", description: "Bạn cũ" }]) }),
      "values.relationships.entries.value.0.person",
    );
  });

  it("rejects unknown sub-fields and deeper nesting", () => {
    expectInvalidAt(
      sheet({
        "appearance.scars": specified([{ id: "s1", description: "Vết bỏng", size: "nhỏ" }]),
      }),
      "values.appearance.scars.value.0",
    );
    expectInvalidAt(
      sheet({
        "appearance.scars": specified([{ id: "s1", description: { text: "lồng nhau" } }]),
      }),
      "values.appearance.scars.value.0.description",
    );
  });

  it("validates history events with flexible time references", () => {
    expectValid(
      sheet({
        "history.events": specified([
          {
            id: "e1",
            title: "Rời làng",
            time: { type: "text", text: "Hai mùa đông sau chiến tranh" },
          },
          { id: "e2", title: "Không có ngày tháng" },
        ]),
      }),
    );
    expectInvalidAt(
      sheet({ "history.events": specified([{ id: "e1", description: "Thiếu tiêu đề" }]) }),
      "values.history.events.value.0.title",
    );
  });
});

describe("selects", () => {
  it("accepts known option codes and rejects unknown ones", () => {
    expectValid(sheet({ "identity.gender": specified({ option: "non_binary" }) }));
    expectInvalidAt(
      sheet({ "identity.gender": specified({ option: "Nữ" }) }),
      "values.identity.gender.value.option",
    );
  });

  it("accepts free text only when the field allows 'other'", () => {
    expectValid(sheet({ "identity.gender": specified({ other: "Linh hồn không giới" }) }));
    expectInvalidAt(
      sheet({
        "lifestyle.skills": specified([
          { id: "s1", name: "Bơi", proficiency: { other: "Tàm tạm" } },
        ]),
      }),
      "values.lifestyle.skills.value.0.proficiency",
    );
  });
});

describe("dates", () => {
  const birth = (value: unknown) => sheet({ "identity.birth_date": specified(value) });

  it("accepts partial and free-text dates", () => {
    expectValid(birth({ type: "calendar", year: 1999 }));
    expectValid(birth({ type: "calendar", month: 2, day: 29 }));
    expectValid(birth({ type: "calendar", year: -300, approximate: true }));
    expectValid(birth({ type: "text", text: "Năm Thìn, tháng Chạp" }));
  });

  it("rejects impossible dates", () => {
    expectInvalidAt(birth({ type: "calendar" }), "values.identity.birth_date.value");
    expectInvalidAt(birth({ type: "calendar", day: 5 }), "values.identity.birth_date.value.day");
    expectInvalidAt(
      birth({ type: "calendar", year: 2023, month: 2, day: 29 }),
      "values.identity.birth_date.value.day",
    );
    expectInvalidAt(
      birth({ type: "calendar", month: 4, day: 31 }),
      "values.identity.birth_date.value.day",
    );
    expectInvalidAt(
      birth({ type: "calendar", month: 13 }),
      "values.identity.birth_date.value.month",
    );
  });
});

describe("character references", () => {
  const relation = (person: unknown) =>
    sheet({ "relationships.entries": specified([{ id: "r1", person }]) });

  it("accepts library and unlinked references", () => {
    expectValid(relation({ type: "character", characterId: SAMPLE_CHARACTER_IDS.minimal }));
    expectValid(
      relation({ type: "unlinked", name: "Ông lão bán sách", note: "Chỉ xuất hiện một lần" }),
    );
  });

  it("rejects malformed references", () => {
    expectInvalidAt(
      relation({ type: "character", characterId: "khai" }),
      "values.relationships.entries.value.0.person.characterId",
    );
    expectInvalidAt(
      relation({ type: "unlinked", name: "" }),
      "values.relationships.entries.value.0.person.name",
    );
    expectInvalidAt(
      relation({ type: "character", name: "Khải" }),
      "values.relationships.entries.value.0.person",
    );
  });

  it("rejects the same library character twice in one list", () => {
    const ref = { type: "character", characterId: SAMPLE_CHARACTER_IDS.contemporary };
    expectInvalidAt(
      sheet({
        "history.events": specified([
          {
            id: "e1",
            title: "Gặp gỡ",
            involved: [
              { id: "a", ref },
              { id: "b", ref },
            ],
          },
        ]),
      }),
      "values.history.events.value.0.involved.1.ref",
    );
  });
});

describe("custom facts", () => {
  const ratingField: CustomFieldDefinition = {
    key: "custom.courage",
    group: "personality",
    label: "Mức độ can đảm",
    kind: "number",
    integer: true,
    min: 1,
    max: 10,
  };
  const withField = (value: unknown, fields: unknown[] = [ratingField], groups: unknown[] = []) =>
    sheet({ "custom.courage": specified(value) }, { custom: { groups, fields } as never });

  it("validates custom values against their definition", () => {
    expectValid(withField(7));
    expectInvalidAt(withField(11), "values.custom.courage.value");
    expectInvalidAt(withField(2.5), "values.custom.courage.value");
    expectInvalidAt(withField("7"), "values.custom.courage.value");
  });

  it("rejects custom values without a definition", () => {
    expectInvalidAt(sheet({ "custom.courage": specified(7) }), "values.custom.courage");
  });

  it("rejects invalid definitions", () => {
    expectInvalidAt(withField(7, [ratingField, ratingField]), "custom.fields.1.key");
    expectInvalidAt(
      withField(7, [{ ...ratingField, group: "cg_missing" }]),
      "custom.fields.0.group",
    );
    expectInvalidAt(
      withField(7, [{ ...ratingField, key: "personality.courage" }]),
      "custom.fields.0.key",
    );
    expectInvalidAt(withField(7, [{ ...ratingField, min: 10, max: 1 }]), "custom.fields.0.min");
  });

  it("allows one level of sub-groups only", () => {
    const groups = [
      { id: "cg_magic", label: "Phép thuật" },
      { id: "cg_spells", label: "Phép", parent: "cg_magic" },
      { id: "cg_too_deep", label: "Quá sâu", parent: "cg_spells" },
      { id: "cg_under_subgroup", label: "Dưới nhóm con có sẵn", parent: "appearance.hair" },
    ];
    const paths = issuePaths(withField(7, [ratingField], groups));
    expect(paths).toContain("custom.groups.2.parent");
    expect(paths).toContain("custom.groups.3.parent");
    expect(paths).not.toContain("custom.groups.1.parent");
  });

  it("requires labels and forbids the reserved `id` sub-field key", () => {
    const listField = {
      key: "custom.artifacts",
      group: "lifestyle",
      label: "Bảo vật",
      kind: "object_list",
      fields: [
        { key: "id", label: "Mã", kind: "short_text" },
        { key: "rarity", kind: "single_select", options: [{ code: "rare" }] },
      ],
    };
    const paths = issuePaths(sheet({}, { custom: { groups: [], fields: [listField] } as never }));
    expect(paths).toContain("custom.fields.0.fields.0.key");
    expect(paths).toContain("custom.fields.0.fields.1.label");
    expect(paths).toContain("custom.fields.0.fields.1.options.0.label");
  });

  it("rejects composite kinds inside objects (depth limit)", () => {
    const nested = {
      key: "custom.nested",
      group: "lifestyle",
      label: "Lồng nhau",
      kind: "object",
      fields: [{ key: "inner", label: "Bên trong", kind: "object_list", fields: [] }],
    };
    expect(issuePaths(sheet({}, { custom: { groups: [], fields: [nested] } as never }))).toContain(
      "custom.fields.0.fields.0.kind",
    );
  });

  it("supports every custom kind", () => {
    expectValid(sampleFantasy);
    const kinds = new Set(sampleFantasy.custom?.fields.map((field) => field.kind));
    expect(kinds).toEqual(
      new Set(["single_select", "number", "object_list", "character_ref", "long_text"]),
    );
  });
});

describe("unicode and Vietnamese text", () => {
  it("accepts Vietnamese, emoji, CJK and decomposed diacritics as-is", () => {
    const decomposed = "Nguyễn".normalize("NFD");
    const input = sheet(
      {
        "identity.full_name": specified(decomposed),
        "identity.other_names": specified([{ id: "n1", name: "月影", context: "Tên Hán tự 🌙" }]),
        "personality.likes": specified([{ id: "l1", text: "Phở bò tái lăn 🍜" }]),
      },
      { displayName: "Đặng Thị Ánh Nguyệt" },
    );
    const result = parseCharacterFacts(input);
    expect(result.success).toBe(true);
    // Not normalised by the schema: what the user typed is what is stored.
    expect((result.data?.values["identity.full_name"] as { value: string }).value).toBe(decomposed);
  });

  it("measures length limits in characters, not bytes", () => {
    expectValid(sheet({ "identity.nationality": specified("ệ".repeat(300)) }));
    expectInvalidAt(
      sheet({ "identity.nationality": specified("ệ".repeat(301)) }),
      "values.identity.nationality.value",
    );
  });
});

describe("parsing is non-destructive", () => {
  it.each(Object.entries(sampleCharacters))(
    "%s round-trips unchanged and is not mutated",
    (_, character) => {
      const snapshot = structuredClone(character);
      const frozen = deepFreeze(structuredClone(character));
      const result = parseCharacterFacts(frozen);
      expect(result.success).toBe(true);
      expect(result.data).toEqual(snapshot);
      expect(frozen).toEqual(snapshot);
    },
  );

  it("rejects unknown keys instead of silently stripping them", () => {
    expectInvalidAt({ ...sampleMinimal, notes: "x" }, "");
    const extra: Record<string, FactValue> = {
      ...sampleContemporary.values,
      "identity.age": {
        state: "specified",
        value: { value: 27, unit: "years", note: "x" } as never,
      },
    };
    expectInvalidAt({ ...sampleContemporary, values: extra }, "values.identity.age.value");
  });
});
