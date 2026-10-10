import { describe, expect, it } from "vitest";

import {
  BUILTIN_FIELDS,
  type BuiltinFieldDefinition,
  type CharacterFacts,
  CHARACTER_FACTS_SCHEMA_VERSION,
  computeFactFingerprints,
  findSensitiveRefs,
  getBuiltinField,
  isSensitive,
  itemRef,
  migrateCharacterFacts,
  parseCharacterFacts,
  selectFactsForAi,
} from "../domain";

import { historicalV2Sheets, v2Contemporary } from "./fixtures/historical-v2";
import { sampleContemporary, sampleContext } from "./fixtures/sample-characters";

const EVENTS = "history.events";
const RELATIONSHIPS = "relationships.entries";

function paths(input: unknown): string[] {
  const result = parseCharacterFacts(input, sampleContext);
  return result.success ? [] : result.error.issues.map((issue) => issue.path.join("."));
}

function withFact(key: string, fact: unknown): unknown {
  return { ...sampleContemporary, values: { ...sampleContemporary.values, [key]: fact } };
}

const events = sampleContemporary.values[EVENTS] as Extract<
  CharacterFacts["values"][string],
  { state: "specified" }
>;

describe("SEN-01 — built-in sensitive fields", () => {
  it("marks biological sex and family circumstances as sensitive", () => {
    expect(isSensitive(getBuiltinField("identity.biological_sex")!)).toBe(true);
    expect(isSensitive(getBuiltinField("background.family")!)).toBe(true);
  });

  it("does not mark the whole background group", () => {
    const fields: readonly BuiltinFieldDefinition[] = BUILTIN_FIELDS;
    const background = fields.filter((field) => field.group === "background");
    const sensitive = background.filter((field) => isSensitive(field)).map((field) => field.key);
    expect(sensitive).toEqual(["background.family"]);
    expect(background.length).toBeGreaterThan(sensitive.length);
  });
});

describe("SEN-02 — per-item sensitivity metadata", () => {
  it("is valid on list fields and survives parsing unchanged", () => {
    const result = parseCharacterFacts(sampleContemporary, sampleContext);
    expect(result.success).toBe(true);
    expect(result.data?.values[EVENTS]).toEqual(events);
    expect(events.sensitiveItemIds).toEqual(["evt_bo_roi_di"]);
  });

  it("must reference existing items, without duplicates, and is never empty", () => {
    const base = { state: "specified", value: events.value };
    expect(paths(withFact(EVENTS, { ...base, sensitiveItemIds: ["evt_khong_ton_tai"] }))).toContain(
      `values.${EVENTS}.sensitiveItemIds.0`,
    );
    expect(
      paths(withFact(EVENTS, { ...base, sensitiveItemIds: ["evt_bo_roi_di", "evt_bo_roi_di"] })),
    ).toContain(`values.${EVENTS}.sensitiveItemIds.1`);
    expect(paths(withFact(EVENTS, { ...base, sensitiveItemIds: [] }))).toContain(
      `values.${EVENTS}.sensitiveItemIds`,
    );
  });

  it("is only allowed on list fields and on specified facts", () => {
    expect(
      paths(
        withFact("identity.full_name", {
          state: "specified",
          value: "Trần Bảo Ngọc",
          sensitiveItemIds: ["x"],
        }),
      ),
    ).toContain("values.identity.full_name.sensitiveItemIds");
    expect(paths(withFact(EVENTS, { state: "explicit_none", sensitiveItemIds: ["x"] }))).toContain(
      `values.${EVENTS}`,
    );
  });

  it("is not mixed into item content", () => {
    for (const item of events.value as Record<string, unknown>[]) {
      expect(Object.keys(item)).not.toContain("sensitive");
      expect(Object.keys(item)).not.toContain("sensitiveItemIds");
    }
  });
});

describe("SEN-02 — AI selection", () => {
  const selection = selectFactsForAi(sampleContemporary, {}, sampleContext);
  const json = JSON.stringify(selection.facts);

  it("drops marked items and keeps the rest of the list", () => {
    const kept = selection.facts.values[EVENTS];
    expect(
      kept?.state === "specified" && (kept.value as { id: string }[]).map((item) => item.id),
    ).toEqual(["evt_giai_thuong", "evt_len_da_lat"]);
    const relationships = selection.facts.values[RELATIONSHIPS];
    expect(
      relationships?.state === "specified" &&
        (relationships.value as { id: string }[]).map((item) => item.id),
    ).toEqual(["rel_khai", "rel_thay_lam"]);
    expect(selection.excluded).toEqual(
      expect.arrayContaining([
        { ref: itemRef(EVENTS, "evt_bo_roi_di"), reason: "sensitive" },
        { ref: itemRef(RELATIONSHIPS, "rel_me"), reason: "sensitive" },
      ]),
    );
  });

  it("leaks nothing from removed items or sensitive fields, nested or not", () => {
    expect(json).not.toContain("Bố rời khỏi gia đình");
    expect(json).not.toContain("Mẹ của Ngọc");
    expect(json).not.toContain("Bố rời gia đình khi Ngọc lên mười"); // psychology.wounds
    expect(json).not.toContain("identity.biological_sex");
  });

  it("never sends privacy metadata", () => {
    expect(json).not.toContain("sensitiveItemIds");
    const allowed = selectFactsForAi(
      sampleContemporary,
      { allowSensitive: [EVENTS] },
      sampleContext,
    );
    expect(JSON.stringify(allowed.facts)).not.toContain("sensitiveItemIds");
  });

  it("an item permission unlocks only that item, for this call only", () => {
    const allowed = selectFactsForAi(
      sampleContemporary,
      { allowSensitive: [itemRef(EVENTS, "evt_bo_roi_di")] },
      sampleContext,
    );
    expect(JSON.stringify(allowed.facts)).toContain("Bố rời khỏi gia đình");
    expect(JSON.stringify(allowed.facts)).not.toContain("Mẹ của Ngọc");
    expect(
      JSON.stringify(selectFactsForAi(sampleContemporary, {}, sampleContext).facts),
    ).not.toContain("Bố rời khỏi gia đình");
  });

  it("a field permission unlocks all its sensitive items", () => {
    const allowed = selectFactsForAi(
      sampleContemporary,
      { allowSensitive: [RELATIONSHIPS] },
      sampleContext,
    );
    expect(JSON.stringify(allowed.facts)).toContain("Mẹ của Ngọc");
  });

  it("an item permission cannot bypass a sensitive parent field", () => {
    const wounds = itemRef("psychology.wounds", "wound_bo_roi_di");
    const allowed = selectFactsForAi(
      sampleContemporary,
      { allowSensitive: [wounds] },
      sampleContext,
    );
    expect(allowed.facts.values).not.toHaveProperty("psychology.wounds");
  });

  it("does not mutate the stored sheet", () => {
    expect(events.sensitiveItemIds).toEqual(["evt_bo_roi_di"]);
  });
});

describe("SEN-02 — fingerprints and staleness", () => {
  const unmarked: CharacterFacts = {
    ...sampleContemporary,
    values: { ...sampleContemporary.values, [EVENTS]: { state: "specified", value: events.value } },
  };

  it("marking an item sensitive does not change any fingerprint", () => {
    expect(computeFactFingerprints(sampleContemporary, sampleContext)).toEqual(
      computeFactFingerprints(unmarked, sampleContext),
    );
  });

  it("content that used a now-sensitive fact is flagged for privacy review instead", () => {
    const used = [
      itemRef(EVENTS, "evt_bo_roi_di"),
      itemRef(EVENTS, "evt_giai_thuong"),
      "identity.age",
    ];
    expect(findSensitiveRefs(used, unmarked, sampleContext)).toEqual([]);
    expect(findSensitiveRefs(used, sampleContemporary, sampleContext)).toEqual([
      itemRef(EVENTS, "evt_bo_roi_di"),
    ]);
    // Field-level refs cover the items they contain; sensitive fields are always flagged.
    expect(
      findSensitiveRefs(
        [EVENTS, "identity.biological_sex", "lib.secret"],
        sampleContemporary,
        sampleContext,
      ),
    ).toEqual([EVENTS, "identity.biological_sex", "lib.secret"]);
  });
});

describe("schema v3 migration", () => {
  it.each(Object.entries(historicalV2Sheets))("%s (v2) migrates to v3 unchanged", (_, sheet) => {
    const result = migrateCharacterFacts(sheet, sampleContext);
    if (result.status !== "migrated") throw new Error(`unexpected ${result.status}`);
    expect(result.fromVersion).toBe(2);
    expect(result.facts).toEqual({ ...sheet, schemaVersion: CHARACTER_FACTS_SCHEMA_VERSION });
    expect(result.review).toEqual([]);
  });

  it("rejects a 'v2' sheet that already uses v3 metadata", () => {
    const fake = {
      ...v2Contemporary,
      values: { ...v2Contemporary.values, [EVENTS]: { ...events } },
    };
    expect(migrateCharacterFacts(fake, sampleContext)).toEqual({
      status: "rejected",
      reason: "invalid_source",
    });
  });
});
