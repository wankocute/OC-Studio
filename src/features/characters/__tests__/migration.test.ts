import { describe, expect, it } from "vitest";

import {
  CHARACTER_FACTS_SCHEMA_VERSION,
  migrateCharacterFacts,
  parseCharacterFacts,
} from "../domain";

import { historicalV1Sheets, v1Contemporary, v1Fantasy, v1Minimal } from "./fixtures/historical-v1";
import { sampleContext, sampleMinimal } from "./fixtures/sample-characters";

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object") {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

describe("historical v1 sheets", () => {
  it.each(Object.entries(historicalV1Sheets))(
    "%s is not accepted as v2 without migration",
    (_, sheet) => {
      expect(parseCharacterFacts(sheet).success).toBe(false);
    },
  );
});

describe("migrateCharacterFacts v1 → v2", () => {
  it.each(Object.entries(historicalV1Sheets))("%s migrates losslessly", (_, sheet) => {
    const frozen = deepFreeze(structuredClone(sheet));
    const result = migrateCharacterFacts(frozen);
    if (result.status !== "migrated") throw new Error(`unexpected ${result.status}`);
    expect(result.fromVersion).toBe(1);
    expect(result.facts).toEqual({ ...sheet, schemaVersion: CHARACTER_FACTS_SCHEMA_VERSION });
    expect(parseCharacterFacts(result.facts).success).toBe(true);
    expect(frozen).toEqual(sheet);
  });

  it("keeps the ambiguous v1 gender value as is and asks for review", () => {
    const result = migrateCharacterFacts(v1Contemporary);
    if (result.status !== "migrated") throw new Error(`unexpected ${result.status}`);
    expect(result.facts.values["identity.gender"]).toEqual({
      state: "specified",
      value: { option: "female" },
    });
    expect(result.facts.values).not.toHaveProperty("identity.gender_identity");
    expect(result.facts.values).not.toHaveProperty("identity.biological_sex");
    expect(result.review).toContainEqual({ key: "identity.gender", reason: "ambiguous_gender" });
  });

  it("never turns not_applicable into explicit_none, but flags where intent may differ", () => {
    const result = migrateCharacterFacts(v1Fantasy);
    if (result.status !== "migrated") throw new Error(`unexpected ${result.status}`);
    expect(result.facts.values["appearance.piercings"]).toEqual({ state: "not_applicable" });
    expect(result.facts.values["identity.family_name"]).toEqual({ state: "not_applicable" });
    expect(result.review).toEqual(
      expect.arrayContaining([
        { key: "appearance.piercings", reason: "not_applicable_may_mean_none" },
        { key: "identity.family_name", reason: "not_applicable_may_mean_none" },
        { key: "identity.gender", reason: "ambiguous_gender" },
      ]),
    );
    // Fields where "none" is not an option are not flagged.
    expect(result.review).not.toContainEqual({
      key: "appearance.hair_color",
      reason: "not_applicable_may_mean_none",
    });
  });

  it("does not invent a source language", () => {
    const result = migrateCharacterFacts(v1Minimal);
    if (result.status !== "migrated") throw new Error(`unexpected ${result.status}`);
    expect(result.facts).not.toHaveProperty("sourceLanguage");
    expect(result.review).toEqual([]);
  });

  it("returns current sheets as they are", () => {
    expect(migrateCharacterFacts(sampleMinimal)).toEqual({
      status: "current",
      facts: sampleMinimal,
    });
  });

  it("rejects what it cannot migrate safely", () => {
    expect(migrateCharacterFacts("không phải object")).toEqual({
      status: "rejected",
      reason: "not_an_object",
    });
    expect(migrateCharacterFacts({ ...v1Minimal, schemaVersion: 7 })).toEqual({
      status: "rejected",
      reason: "unsupported_version",
    });
    // A "v1" sheet using v2-only features is not genuine v1.
    expect(
      migrateCharacterFacts({
        ...v1Minimal,
        values: { "appearance.tattoos": { state: "explicit_none" } },
      }),
    ).toMatchObject({ status: "rejected", reason: "invalid_source" });
    expect(migrateCharacterFacts({ ...v1Minimal, sourceLanguage: "vi" })).toMatchObject({
      status: "rejected",
      reason: "invalid_source",
    });
    // Invalid v1 data is reported, not repaired.
    const broken = migrateCharacterFacts({
      ...v1Minimal,
      values: { "identity.age": { state: "specified", value: "27" } },
    });
    expect(broken).toMatchObject({ status: "rejected", reason: "invalid_source" });
    if (broken.status === "rejected") expect(broken.issues?.length).toBeGreaterThan(0);
  });

  it("needs library definitions for v2 sheets that use them", () => {
    const withLibrary = { ...sampleMinimal, values: { "lib.zodiac": { state: "not_applicable" } } };
    expect(migrateCharacterFacts(withLibrary).status).toBe("rejected");
    expect(migrateCharacterFacts(withLibrary, sampleContext).status).toBe("current");
  });
});
