import { describe, expect, it } from "vitest";

import {
  BASIC_FIELD_KEYS,
  BUILTIN_FIELDS,
  createTemplatePresentationSchema,
  getBuiltinField,
  getFieldGroup,
  getFieldVisibility,
} from "../domain";

import { sampleContemporary, sampleContext, sampleFantasy } from "./fixtures/sample-characters";

describe("basic / advanced mode (Q7)", () => {
  it("basic fields are existing, non-deprecated built-in fields", () => {
    for (const key of BASIC_FIELD_KEYS) {
      const definition = getBuiltinField(key);
      expect(definition, key).toBeDefined();
      expect(definition && "deprecated" in definition && definition.deprecated, key).toBeFalsy();
    }
    expect(BASIC_FIELD_KEYS.length).toBeLessThan(BUILTIN_FIELDS.length / 2);
  });

  it("basic mode hides advanced fields; advanced shows all", () => {
    expect(getFieldVisibility("identity.full_name", { mode: "basic" })).toBe("visible");
    expect(getFieldVisibility("appearance.nose", { mode: "basic" })).toBe("hidden");
    expect(getFieldVisibility("appearance.nose", { mode: "advanced" })).toBe("visible");
  });

  it("never hides data silently when switching mode", () => {
    // `appearance.hair_length` is advanced but has a value in this sheet.
    expect(
      getFieldVisibility("appearance.hair_length", { mode: "basic", facts: sampleContemporary }),
    ).toBe("hidden_with_data");
    // explicit_none counts as stored data too.
    expect(
      getFieldVisibility("appearance.scars", { mode: "basic", facts: sampleContemporary }),
    ).toBe("hidden_with_data");
  });

  it("always shows character-scoped custom fields", () => {
    expect(getFieldVisibility("custom.wing_pattern", { mode: "basic", facts: sampleFantasy })).toBe(
      "visible",
    );
  });

  it("hides the deprecated gender field unless it holds v1 data", () => {
    expect(getFieldVisibility("identity.gender", { mode: "advanced" })).toBe("hidden");
    const legacy = {
      values: { "identity.gender": { state: "specified" as const, value: { option: "female" } } },
    };
    expect(getFieldVisibility("identity.gender", { mode: "advanced", facts: legacy })).toBe(
      "hidden_with_data",
    );
  });
});

describe("template presentation (Q12)", () => {
  const schema = createTemplatePresentationSchema(sampleContext);

  it("may hide, reorder and regroup fields and include library fields", () => {
    const template = {
      hiddenFields: ["identity.nationality"],
      fieldOrder: ["identity.species", "identity.full_name"],
      groupPlacement: { "appearance.voice": "behavior", "lib.zodiac": "lg_worldbuilding" },
      libraryFields: ["lib.zodiac"],
    };
    expect(schema.safeParse(template).success).toBe(true);

    const context = { mode: "advanced" as const, template, definitions: sampleContext };
    expect(getFieldVisibility("identity.nationality", context)).toBe("hidden");
    expect(getFieldVisibility("lib.zodiac", context)).toBe("visible");
    expect(getFieldGroup("appearance.voice", context)).toBe("behavior");
    expect(getFieldGroup("appearance.height", context)).toBe("appearance.body");
  });

  it("cannot change keys, kinds or values", () => {
    expect(
      schema.safeParse({ fields: [{ key: "identity.age", kind: "short_text" }] }).success,
    ).toBe(false);
    expect(schema.safeParse({ values: { "identity.age": null } }).success).toBe(false);
  });

  it("rejects unknown fields, character-scoped fields and unknown groups", () => {
    const result = schema.safeParse({
      hiddenFields: ["identity.favorite_color", "custom.spells"],
      libraryFields: ["identity.age"],
      groupPlacement: { "identity.age": "cg_magic" },
    });
    const paths = result.success ? [] : result.error.issues.map((issue) => issue.path.join("."));
    expect(paths).toEqual(
      expect.arrayContaining([
        "hiddenFields.0",
        "hiddenFields.1",
        "libraryFields.0",
        "groupPlacement.identity.age",
      ]),
    );
  });

  it("hiding a field with data reports it instead of treating it as unspecified", () => {
    const context = {
      mode: "advanced" as const,
      template: { hiddenFields: ["identity.nationality"] },
      facts: sampleContemporary,
    };
    expect(getFieldVisibility("identity.nationality", context)).toBe("hidden_with_data");
    expect(sampleContemporary.values["identity.nationality"]).toEqual({
      state: "specified",
      value: "Việt Nam",
    });
  });

  it("shows library fields the character already uses even if the template omits them", () => {
    expect(
      getFieldVisibility("lib.secret", {
        mode: "basic",
        facts: sampleContemporary,
        definitions: sampleContext,
      }),
    ).toBe("visible");
    expect(getFieldVisibility("lib.secret", { mode: "basic", definitions: sampleContext })).toBe(
      "hidden",
    );
  });
});
