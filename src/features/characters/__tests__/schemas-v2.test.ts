import { describe, expect, it } from "vitest";

import {
  CHARACTER_FACTS_SCHEMA_VERSION,
  getBuiltinField,
  LIMITS,
  parseCharacterFacts,
} from "../domain";

import {
  SAMPLE_CHARACTER_IDS,
  sampleContemporary,
  sampleContext,
} from "./fixtures/sample-characters";

function sheet(values: Record<string, unknown>, extra: Record<string, unknown> = {}): unknown {
  return {
    schemaVersion: CHARACTER_FACTS_SCHEMA_VERSION,
    displayName: "Thử nghiệm",
    values,
    ...extra,
  };
}

function issuePaths(input: unknown): string[] {
  const result = parseCharacterFacts(input, sampleContext);
  return result.success ? [] : result.error.issues.map((issue) => issue.path.join("."));
}

const NONE = { state: "explicit_none" } as const;

describe("explicit_none (Q3)", () => {
  it("is accepted on collection fields", () => {
    expect(issuePaths(sheet({ "appearance.tattoos": NONE }))).toEqual([]);
    expect(issuePaths(sheet({ "identity.nicknames": NONE }))).toEqual([]);
    expect(issuePaths(sheet({ "relationships.entries": NONE }))).toEqual([]);
  });

  it("is accepted on single-valued fields that opt in", () => {
    expect(getBuiltinField("identity.family_name")?.allowExplicitNone).toBe(true);
    expect(issuePaths(sheet({ "identity.family_name": NONE }))).toEqual([]);
    expect(issuePaths(sheet({ "lifestyle.occupation": NONE }))).toEqual([]);
  });

  it("is rejected where 'none' is not a meaningful answer", () => {
    expect(issuePaths(sheet({ "appearance.height": NONE }))).toContain(
      "values.appearance.height.state",
    );
    expect(issuePaths(sheet({ "identity.birth_date": NONE }))).toContain(
      "values.identity.birth_date.state",
    );
  });

  it("never carries a value and is not an empty list or string", () => {
    expect(
      issuePaths(sheet({ "appearance.tattoos": { state: "explicit_none", value: [] } })),
    ).toContain("values.appearance.tattoos");
    // An empty list is still invalid as `specified` — it does not mean "none".
    expect(
      issuePaths(sheet({ "appearance.tattoos": { state: "specified", value: [] } })),
    ).toContain("values.appearance.tattoos.value");
  });

  it("is distinct from not_applicable for the same field", () => {
    expect(issuePaths(sheet({ "appearance.piercings": { state: "not_applicable" } }))).toEqual([]);
    expect(issuePaths(sheet({ "appearance.piercings": NONE }))).toEqual([]);
  });
});

describe("source language (Q9)", () => {
  it("is optional — absent means unknown", () => {
    expect(issuePaths(sheet({}))).toEqual([]);
  });

  it.each(["vi", "en", "en-US", "zh-Hant-TW", "ja"])("accepts canonical BCP 47 tag %s", (tag) => {
    expect(issuePaths(sheet({}, { sourceLanguage: tag }))).toEqual([]);
  });

  it.each(["en-us", "EN", "en_US", "Tiếng Việt", "", "x"])("rejects %j", (tag) => {
    expect(issuePaths(sheet({}, { sourceLanguage: tag }))).toContain("sourceLanguage");
  });

  it("does not require per-field languages; values may mix languages", () => {
    const mixed = sheet(
      {
        "identity.full_name": { state: "specified", value: "Trần Bảo Ngọc" },
        "behavior.verbal_tics": {
          state: "specified",
          value: [{ id: "tic_en", text: "Whatever!" }],
        },
      },
      { sourceLanguage: "vi" },
    );
    expect(issuePaths(mixed)).toEqual([]);
  });
});

describe("gender identity and biological sex (Q8)", () => {
  it("are two independent optional fields", () => {
    expect(
      issuePaths(
        sheet({ "identity.gender_identity": { state: "specified", value: { option: "man" } } }),
      ),
    ).toEqual([]);
    expect(
      issuePaths(
        sheet({ "identity.biological_sex": { state: "specified", value: { option: "intersex" } } }),
      ),
    ).toEqual([]);
    // Combinations are never cross-checked or inferred.
    expect(
      issuePaths(
        sheet({
          "identity.gender_identity": { state: "specified", value: { option: "woman" } },
          "identity.biological_sex": { state: "specified", value: { option: "male" } },
        }),
      ),
    ).toEqual([]);
  });

  it("allow free answers and not_applicable for non-human characters", () => {
    expect(
      issuePaths(
        sheet({
          "identity.gender_identity": { state: "specified", value: { other: "Linh hồn vô tính" } },
          "identity.biological_sex": { state: "not_applicable" },
        }),
      ),
    ).toEqual([]);
  });

  it("use their own option codes", () => {
    expect(
      issuePaths(
        sheet({ "identity.gender_identity": { state: "specified", value: { option: "female" } } }),
      ),
    ).toContain("values.identity.gender_identity.value.option");
  });

  it("keep the deprecated v1 field valid so old data is never lost", () => {
    expect(getBuiltinField("identity.gender")).toMatchObject({ deprecated: true });
    expect(
      issuePaths(sheet({ "identity.gender": { state: "specified", value: { option: "female" } } })),
    ).toEqual([]);
  });
});

describe("display name (Q2)", () => {
  it("is independent from identity names", () => {
    expect(sampleContemporary.displayName).not.toBe(
      (sampleContemporary.values["identity.full_name"] as { value: string }).value,
    );
    expect(issuePaths(sampleContemporary)).toEqual([]);
    expect(
      issuePaths(
        sheet(
          { "identity.full_name": { state: "specified", value: "Khác hẳn" } },
          { displayName: "Bí danh" },
        ),
      ),
    ).toEqual([]);
  });

  it("is required even when identity names exist", () => {
    expect(
      issuePaths({
        schemaVersion: CHARACTER_FACTS_SCHEMA_VERSION,
        values: { "identity.full_name": { state: "specified", value: "Trần Bảo Ngọc" } },
      }),
    ).toContain("displayName");
  });

  it("enforces its length limit", () => {
    expect(issuePaths(sheet({}, { displayName: "a".repeat(LIMITS.displayName) }))).toEqual([]);
    expect(issuePaths(sheet({}, { displayName: "a".repeat(LIMITS.displayName + 1) }))).toContain(
      "displayName",
    );
  });
});

describe("detached references (Q5)", () => {
  const relation = (person: unknown) =>
    sheet({ "relationships.entries": { state: "specified", value: [{ id: "r1", person }] } });
  const detached = {
    characterId: SAMPLE_CHARACTER_IDS.deleted,
    reason: "character_deleted",
    at: "2026-09-30T08:15:00Z",
  };

  it("accepts an unlinked reference that records its former link", () => {
    expect(
      issuePaths(relation({ type: "unlinked", name: "Thầy Lâm", detachedFrom: detached })),
    ).toEqual([]);
  });

  it("validates the detach record", () => {
    const base = { type: "unlinked", name: "Thầy Lâm" };
    const path = "values.relationships.entries.value.0.person.detachedFrom";
    expect(
      issuePaths(relation({ ...base, detachedFrom: { ...detached, reason: "merged" } })),
    ).toContain(`${path}.reason`);
    expect(
      issuePaths(relation({ ...base, detachedFrom: { ...detached, at: "hôm qua" } })),
    ).toContain(`${path}.at`);
    expect(
      issuePaths(relation({ ...base, detachedFrom: { ...detached, characterId: "x" } })),
    ).toContain(`${path}.characterId`);
  });

  it("does not allow a linked reference to carry a detach record", () => {
    expect(
      issuePaths(
        relation({
          type: "character",
          characterId: SAMPLE_CHARACTER_IDS.minimal,
          detachedFrom: detached,
        }),
      ),
    ).toContain("values.relationships.entries.value.0.person");
  });
});

describe("limits (Q11)", () => {
  const text = (length: number) =>
    sheet({ "identity.nationality": { state: "specified", value: "ệ".repeat(length) } });
  const list = (count: number) =>
    sheet({
      "personality.likes": {
        state: "specified",
        value: Array.from({ length: count }, (_, index) => ({ id: `l${index}`, text: "x" })),
      },
    });

  it("accept values at the limit and reject one past it", () => {
    expect(issuePaths(text(LIMITS.shortText))).toEqual([]);
    expect(issuePaths(text(LIMITS.shortText + 1))).toContain("values.identity.nationality.value");
    expect(issuePaths(list(LIMITS.listItems))).toEqual([]);
    expect(issuePaths(list(LIMITS.listItems + 1))).toContain("values.personality.likes.value");
  });

  it("explain the limit in the message", () => {
    const result = parseCharacterFacts(text(LIMITS.shortText + 1), sampleContext);
    expect(result.error?.issues[0]?.message).toContain(String(LIMITS.shortText));
  });

  it("use the history-specific list limit", () => {
    expect(getBuiltinField("history.events")).toMatchObject({ maxItems: LIMITS.historyEvents });
  });
});
