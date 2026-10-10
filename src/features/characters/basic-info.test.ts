import { describe, expect, it } from "vitest";

import {
  applyBasicInfo,
  basicInfoSchema,
  createFactsFromBasicInfo,
  summarizeCharacter,
  toBasicInfoForm,
} from "./basic-info";
import { type CharacterFacts, LIMITS, parseCharacterFacts } from "./domain";
import {
  sampleContemporary,
  sampleContext,
  sampleFantasy,
} from "./__tests__/fixtures/sample-characters";

const base = {
  displayName: "Ngọc",
  fullName: "",
  age: "",
  ageApproximate: false,
  genderIdentity: "",
  genderOther: "",
  pronouns: "",
  species: "",
  occupation: "",
};

function parse(input: Partial<typeof base>) {
  return basicInfoSchema.safeParse({ ...base, ...input });
}

function info(input: Partial<typeof base>) {
  const result = parse(input);
  if (!result.success) throw result.error;
  return result.data;
}

describe("basic info validation", () => {
  it("requires a non-blank display name and trims / NFC-normalises it", () => {
    expect(parse({ displayName: "   " }).success).toBe(false);
    expect(parse({ displayName: "" }).error?.issues[0]?.path).toEqual(["displayName"]);
    expect(info({ displayName: "  Nguyễn  ".normalize("NFD") }).displayName).toBe(
      "Nguyễn".normalize("NFC"),
    );
  });

  it("enforces the display-name limit", () => {
    expect(parse({ displayName: "a".repeat(LIMITS.displayName) }).success).toBe(true);
    expect(parse({ displayName: "a".repeat(LIMITS.displayName + 1) }).success).toBe(false);
  });

  it("accepts only whole, non-negative ages", () => {
    expect(info({ age: " 27 " }).age).toBe("27");
    for (const age of ["-1", "2.5", "hai mươi", "1e3"]) {
      expect(parse({ age }).success, age).toBe(false);
    }
  });

  it("requires a description when gender identity is 'other'", () => {
    expect(parse({ genderIdentity: "other" }).error?.issues[0]?.path).toEqual(["genderOther"]);
    expect(parse({ genderIdentity: "other", genderOther: "Vô giới tính" }).success).toBe(true);
    expect(parse({ genderIdentity: "female" }).success).toBe(false); // biological-sex code
  });
});

describe("createFactsFromBasicInfo", () => {
  it("builds a valid sheet with only the entered facts", () => {
    const facts = createFactsFromBasicInfo(
      info({
        fullName: "Trần Bảo Ngọc",
        age: "27",
        ageApproximate: true,
        genderIdentity: "woman",
        occupation: "Họa sĩ",
      }),
    );
    expect(parseCharacterFacts(facts).success).toBe(true);
    expect(facts.values).toEqual({
      "identity.full_name": { state: "specified", value: "Trần Bảo Ngọc" },
      "identity.age": {
        state: "specified",
        value: { value: 27, unit: "years", approximate: true },
      },
      "identity.gender_identity": { state: "specified", value: { option: "woman" } },
      "lifestyle.occupation": { state: "specified", value: "Họa sĩ" },
    });
    expect(facts).not.toHaveProperty("sourceLanguage");
  });

  it("stores 'other' gender verbatim", () => {
    const facts = createFactsFromBasicInfo(
      info({ genderIdentity: "other", genderOther: "Linh hồn không giới" }),
    );
    expect(facts.values["identity.gender_identity"]).toEqual({
      state: "specified",
      value: { other: "Linh hồn không giới" },
    });
  });
});

describe("applyBasicInfo", () => {
  it("round-trips: saving the unchanged form changes nothing", () => {
    const form = toBasicInfoForm(sampleContemporary);
    const next = applyBasicInfo(sampleContemporary, info(form.values));
    expect(next).toEqual(sampleContemporary);
  });

  it("keeps every other fact, privacy metadata and library field", () => {
    const form = toBasicInfoForm(sampleContemporary);
    const next = applyBasicInfo(
      sampleContemporary,
      info({ ...form.values, displayName: "Bảo Ngọc", occupation: "" }),
    );
    expect(next.displayName).toBe("Bảo Ngọc");
    expect(next.values).not.toHaveProperty("lifestyle.occupation");
    const others = { ...sampleContemporary.values };
    delete others["lifestyle.occupation"];
    expect(next.values).toEqual(others);
    expect(parseCharacterFacts(next, sampleContext).success).toBe(true);
  });

  it("locks fields the form cannot represent and never rewrites them", () => {
    const form = toBasicInfoForm(sampleFantasy);
    expect(form.locked).toEqual({}); // fantasy's basic fields are representable
    const withStates: CharacterFacts = {
      ...sampleFantasy,
      values: {
        ...sampleFantasy.values,
        "lifestyle.occupation": { state: "explicit_none" },
        "identity.species": { state: "not_applicable" },
        "identity.age": { state: "specified", value: { value: 6, unit: "months" } },
      },
    };
    const lockedForm = toBasicInfoForm(withStates);
    expect(lockedForm.locked).toEqual({
      occupation: "explicit_none",
      species: "not_applicable",
      age: "unsupported",
    });
    const next = applyBasicInfo(withStates, info({ ...lockedForm.values, occupation: "Thợ rèn" }));
    expect(next.values["lifestyle.occupation"]).toEqual({ state: "explicit_none" });
    expect(next.values["identity.species"]).toEqual({ state: "not_applicable" });
    expect(next.values["identity.age"]).toEqual({
      state: "specified",
      value: { value: 6, unit: "months" },
    });
  });

  it("keeps approximate ages when the number is unchanged", () => {
    const form = toBasicInfoForm(sampleFantasy);
    expect(form.values).toMatchObject({ age: "340", ageApproximate: true });
    const next = applyBasicInfo(sampleFantasy, info(form.values));
    expect(next.values["identity.age"]).toBe(sampleFantasy.values["identity.age"]);
  });
});

describe("summarizeCharacter", () => {
  it("lists species, age and occupation from specified facts only", () => {
    expect(summarizeCharacter(sampleContemporary.values)).toEqual([
      "Người",
      "27 tuổi",
      "Họa sĩ minh họa tự do kiêm pha chế",
    ]);
    expect(summarizeCharacter(sampleFantasy.values)).toEqual([
      "Tinh linh bướm đêm",
      "khoảng 340 tuổi",
    ]);
    expect(summarizeCharacter({ "identity.species": { state: "not_applicable" } })).toEqual([]);
  });
});
