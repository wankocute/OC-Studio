import { describe, expect, it } from "vitest";

import {
  type CharacterFacts,
  getBuiltinField,
  isSensitive,
  parseCharacterFacts,
  selectFactsForAi,
} from "../domain";

import { sampleContemporary, sampleContext, sampleFantasy } from "./fixtures/sample-characters";

describe("sensitivity metadata (Q6)", () => {
  it("marks built-in fields and sub-fields", () => {
    expect(isSensitive(getBuiltinField("psychology.wounds")!)).toBe(true);
    expect(isSensitive(getBuiltinField("personality.likes")!)).toBe(false);
    const scars = getBuiltinField("appearance.scars")!;
    if (scars.kind !== "object_list") throw new Error("definition changed");
    expect(scars.fields.find((field) => field.key === "origin")?.sensitivity).toBe("sensitive");
  });

  it("can mark custom and library fields", () => {
    expect(
      sampleFantasy.custom?.fields.find((field) => field.key === "custom.true_name")?.sensitivity,
    ).toBe("sensitive");
    expect(
      sampleContext.library?.fields.find((field) => field.key === "lib.secret")?.sensitivity,
    ).toBe("sensitive");
  });

  it("forbids required sensitive sub-fields (they would break items when stripped)", () => {
    const facts = {
      ...sampleFantasy,
      custom: {
        groups: [],
        fields: [
          {
            key: "custom.diary",
            group: "history",
            label: "Nhật ký",
            kind: "object_list",
            fields: [
              {
                key: "entry",
                label: "Nội dung",
                kind: "long_text",
                required: true,
                sensitivity: "sensitive",
              },
            ],
          },
        ],
      },
      values: {},
    };
    const result = parseCharacterFacts(facts);
    expect(
      result.success ? [] : result.error.issues.map((issue) => issue.path.join(".")),
    ).toContain("custom.fields.0.fields.0.required");
  });
});

describe("selectFactsForAi", () => {
  it("excludes sensitive fields by default, whatever their state", () => {
    const { facts, excluded } = selectFactsForAi(sampleContemporary, {}, sampleContext);
    expect(facts.values).not.toHaveProperty("psychology.wounds");
    expect(facts.values).not.toHaveProperty("lib.secret");
    expect(excluded).toEqual(
      expect.arrayContaining([
        { ref: "psychology.wounds", reason: "sensitive" },
        { ref: "lib.secret", reason: "sensitive" },
      ]),
    );
    // Non-sensitive facts are kept unchanged.
    expect(facts.values["personality.likes"]).toEqual(
      sampleContemporary.values["personality.likes"],
    );
    expect(facts.displayName).toBe(sampleContemporary.displayName);
  });

  it("treats explicit_none and not_applicable of sensitive fields as sensitive too", () => {
    const withNone = {
      ...sampleContemporary,
      values: { "psychology.wounds": { state: "explicit_none" as const } },
    };
    expect(selectFactsForAi(withNone).facts.values).toEqual({});
  });

  it("includes a sensitive field only when allowed for this request", () => {
    const allowed = selectFactsForAi(
      sampleContemporary,
      { allowSensitive: ["psychology.wounds"] },
      sampleContext,
    );
    expect(allowed.facts.values["psychology.wounds"]).toEqual(
      sampleContemporary.values["psychology.wounds"],
    );
    expect(allowed.facts.values).not.toHaveProperty("lib.secret");

    // Permission is not remembered: the next call without it excludes the field again.
    expect(selectFactsForAi(sampleContemporary, {}, sampleContext).facts.values).not.toHaveProperty(
      "psychology.wounds",
    );
  });

  it("strips sensitive sub-fields from list items and drops items left empty", () => {
    const { facts, excluded } = selectFactsForAi(sampleFantasy);
    const spells = facts.values["custom.spells"];
    expect(spells).toEqual({
      state: "specified",
      value: [
        { id: "spell_veil", name: "Màn sương bạc", cost: 30 },
        {
          id: "spell_dream",
          name: "Dệt giấc mơ",
          description: "Chỉ dùng được với người đang ngủ.",
        },
      ],
    });
    expect(excluded).toContainEqual({
      ref: "custom.spells[spell_dream]",
      subfield: "weakness",
      reason: "sensitive",
    });

    const onlySecret: CharacterFacts = {
      ...sampleContemporary,
      values: {
        "appearance.scars": {
          state: "specified",
          value: [
            { id: "s1", description: "Vết bỏng nhỏ", origin: "Tai nạn bếp" },
            { id: "s2", origin: "Một đêm không muốn nhớ" },
          ],
        },
      },
    };
    const selection = selectFactsForAi(onlySecret);
    expect(selection.facts.values["appearance.scars"]).toEqual({
      state: "specified",
      value: [{ id: "s1", description: "Vết bỏng nhỏ" }],
    });
    expect(selection.excluded).toContainEqual({ ref: "appearance.scars[s2]", reason: "sensitive" });
  });

  it("removes definitions of excluded custom fields so their labels do not leak", () => {
    const { facts } = selectFactsForAi(sampleFantasy);
    expect(facts.custom?.fields.map((field) => field.key)).not.toContain("custom.true_name");
    expect(facts.values).not.toHaveProperty("custom.true_name");
  });

  it("excludes facts whose definition cannot be resolved", () => {
    const { facts, excluded } = selectFactsForAi(sampleContemporary);
    expect(facts.values).not.toHaveProperty("lib.zodiac");
    expect(excluded).toContainEqual({ ref: "lib.zodiac", reason: "unresolved_definition" });
  });

  it("does not mutate the input", () => {
    const before = structuredClone(sampleFantasy);
    selectFactsForAi(sampleFantasy);
    expect(sampleFantasy).toEqual(before);
  });
});
