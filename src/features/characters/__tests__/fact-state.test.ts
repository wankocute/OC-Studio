import { describe, expect, it } from "vitest";

import {
  CHARACTER_FACTS_SCHEMA_VERSION,
  getFactState,
  normalizeFactInput,
  normalizeLanguageInput,
  parseCharacterFacts,
} from "../domain";

import { sampleContemporary, sampleFantasy } from "./fixtures/sample-characters";

describe("normalizeFactInput — UI input → fact state", () => {
  it("maps the not-applicable toggle to not_applicable regardless of value", () => {
    expect(normalizeFactInput({ notApplicable: true, value: "Việt Nam" })).toEqual({
      state: "not_applicable",
    });
  });

  it.each([
    ["undefined", undefined],
    ["null", null],
    ["empty string", ""],
    ["whitespace", "  \n\t "],
    ["empty list", []],
    [
      "list of blank items",
      [
        { id: "a", text: " " },
        { id: "b", text: "" },
      ],
    ],
    ["measure without number", { unit: "cm" }],
    ["unlinked ref without name", { type: "unlinked", name: "" }],
    ["calendar date without parts", { type: "calendar" }],
  ])("treats %s as unspecified", (_, value) => {
    expect(normalizeFactInput({ value })).toBeUndefined();
  });

  it("keeps false and 0 as real values", () => {
    expect(normalizeFactInput({ value: false })).toEqual({ state: "specified", value: false });
    expect(normalizeFactInput({ value: 0 })).toEqual({ state: "specified", value: 0 });
  });

  it("trims and NFC-normalises text", () => {
    const decomposed = "  Nguyễn Văn A  ".normalize("NFD");
    const result = normalizeFactInput({ value: decomposed });
    expect(result).toEqual({ state: "specified", value: "Nguyễn Văn A".normalize("NFC") });
  });

  it("drops blank items and blank sub-fields but keeps stable ids", () => {
    const result = normalizeFactInput({
      value: [
        { id: "t1", description: " Rồng cuộn ", location: "" },
        { id: "t2", description: "", location: "  " },
      ],
    });
    expect(result).toEqual({ state: "specified", value: [{ id: "t1", description: "Rồng cuộn" }] });
  });

  it("keeps invalid input so validation can report it", () => {
    const fact = normalizeFactInput({ value: { value: Number.NaN, unit: "cm" } });
    expect(fact?.state).toBe("specified");
    const result = parseCharacterFacts({
      schemaVersion: CHARACTER_FACTS_SCHEMA_VERSION,
      displayName: "A",
      values: { "appearance.height": fact },
    });
    expect(result.error?.issues.map((issue) => issue.path.join("."))).toEqual([
      "values.appearance.height.value.value",
    ]);
  });
});

describe("getFactState", () => {
  it("distinguishes the three states", () => {
    expect(getFactState(sampleFantasy, "identity.species")).toBe("specified");
    expect(getFactState(sampleFantasy, "identity.nationality")).toBe("not_applicable");
    expect(getFactState(sampleFantasy, "appearance.weight")).toBe("unspecified");
  });
});

describe("explicit_none input (Q3)", () => {
  it("maps the 'confirmed none' toggle to explicit_none regardless of value", () => {
    expect(normalizeFactInput({ explicitNone: true })).toEqual({ state: "explicit_none" });
    expect(normalizeFactInput({ explicitNone: true, value: [{ id: "t1", text: "Rồng" }] })).toEqual(
      {
        state: "explicit_none",
      },
    );
  });

  it("never derives explicit_none from an empty value", () => {
    expect(normalizeFactInput({ value: [] })).toBeUndefined();
    expect(normalizeFactInput({ value: "" })).toBeUndefined();
  });

  it("rejects both toggles at once as a programming error", () => {
    expect(() => normalizeFactInput({ explicitNone: true, notApplicable: true })).toThrow(
      TypeError,
    );
  });

  it("reports the four states", () => {
    expect(getFactState(sampleContemporary, "appearance.scars")).toBe("explicit_none");
    expect(getFactState(sampleContemporary, "appearance.tattoos")).toBe("specified");
    expect(getFactState(sampleFantasy, "appearance.piercings")).toBe("not_applicable");
    expect(getFactState(sampleContemporary, "appearance.piercings")).toBe("unspecified");
  });
});

describe("normalizeLanguageInput (Q9)", () => {
  it("canonicalises tags and treats blank as unknown", () => {
    expect(normalizeLanguageInput(" en-us ")).toBe("en-US");
    expect(normalizeLanguageInput("VI")).toBe("vi");
    expect(normalizeLanguageInput("")).toBeUndefined();
    expect(normalizeLanguageInput(undefined)).toBeUndefined();
  });

  it("keeps malformed input so validation can report it", () => {
    expect(normalizeLanguageInput("Tiếng Việt")).toBe("Tiếng Việt");
  });
});
