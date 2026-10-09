import { describe, expect, it } from "vitest";

import { getFactState, normalizeFactInput, parseCharacterFacts } from "../domain";

import { sampleFantasy } from "./fixtures/sample-characters";

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
      schemaVersion: 1,
      displayName: "A",
      values: { "appearance.height": fact },
    });
    expect(result.success).toBe(false);
  });
});

describe("getFactState", () => {
  it("distinguishes the three states", () => {
    expect(getFactState(sampleFantasy, "identity.species")).toBe("specified");
    expect(getFactState(sampleFantasy, "identity.nationality")).toBe("not_applicable");
    expect(getFactState(sampleFantasy, "appearance.weight")).toBe("unspecified");
  });
});
