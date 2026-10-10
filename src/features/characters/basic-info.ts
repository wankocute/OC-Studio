/**
 * The "basic info" subset of a character edited outside the full Fact Editor:
 * display name + six commonly used built-in facts.
 *
 * Shared by client forms (instant validation) and Server Actions (authoritative validation).
 * Editing basic info never touches any other fact, and a field whose stored fact cannot be
 * represented by this form (e.g. `not_applicable`, or an age in months) is locked, not rewritten.
 */
import { z } from "zod";

import {
  type CharacterFacts,
  CHARACTER_FACTS_SCHEMA_VERSION,
  canonicalJson,
  type FactValue,
  GENDER_IDENTITY_OPTIONS,
  LIMITS,
  normalizeFactInput,
} from "@/features/characters/domain";
import { messages } from "@/i18n";

const t = messages.characters.validation;

export const BASIC_FACT_KEYS = {
  fullName: "identity.full_name",
  age: "identity.age",
  genderIdentity: "identity.gender_identity",
  pronouns: "identity.pronouns",
  species: "identity.species",
  occupation: "lifestyle.occupation",
} as const;

export type BasicFactField = keyof typeof BASIC_FACT_KEYS;

export const GENDER_OTHER = "other";
export const GENDER_IDENTITY_CODES: readonly string[] = GENDER_IDENTITY_OPTIONS.map((o) => o.code);

const cleanText = (value: string) => value.normalize("NFC").trim();

function optionalText(max: number) {
  return z
    .string()
    .default("")
    .transform(cleanText)
    .pipe(z.string().max(max, t.tooLong(max)));
}

/** Raw form values (all strings / booleans), validated and cleaned by `basicInfoSchema`. */
export const basicInfoSchema = z
  .object({
    displayName: z
      .string()
      .transform(cleanText)
      .pipe(
        z
          .string()
          .min(1, t.displayNameRequired)
          .max(LIMITS.displayName, t.tooLong(LIMITS.displayName)),
      ),
    fullName: optionalText(LIMITS.shortText),
    age: z
      .string()
      .default("")
      .transform((value) => value.trim())
      .pipe(z.union([z.literal(""), z.string().regex(/^\d{1,6}$/, t.ageInvalid)])),
    ageApproximate: z.boolean().default(false),
    genderIdentity: z
      .string()
      .default("")
      .refine(
        (value) => value === "" || value === GENDER_OTHER || GENDER_IDENTITY_CODES.includes(value),
        t.genderOtherRequired,
      ),
    genderOther: optionalText(LIMITS.shortText),
    pronouns: optionalText(LIMITS.shortText),
    species: optionalText(LIMITS.shortText),
    occupation: optionalText(LIMITS.shortText),
  })
  .superRefine((value, ctx) => {
    if (value.genderIdentity === GENDER_OTHER && value.genderOther === "") {
      ctx.addIssue({ code: "custom", message: t.genderOtherRequired, path: ["genderOther"] });
    }
  });

export type BasicInfoInput = z.input<typeof basicInfoSchema>;
export type BasicInfo = z.output<typeof basicInfoSchema>;

/** Form values for the editor: strings for inputs, plus which fields are read-only. */
export type BasicInfoFormState = {
  values: Required<BasicInfoInput>;
  locked: Partial<Record<BasicFactField, "explicit_none" | "not_applicable" | "unsupported">>;
};

/** The stored fact this form would write for one field, or `undefined` for "unspecified". */
function factFor(field: BasicFactField, info: BasicInfo): FactValue | undefined {
  switch (field) {
    case "age":
      return info.age === ""
        ? undefined
        : {
            state: "specified",
            value: {
              value: Number(info.age),
              unit: "years",
              ...(info.ageApproximate ? { approximate: true } : {}),
            },
          };
    case "genderIdentity":
      if (info.genderIdentity === "") return undefined;
      return {
        state: "specified",
        value:
          info.genderIdentity === GENDER_OTHER
            ? { other: info.genderOther }
            : { option: info.genderIdentity },
      };
    default:
      return normalizeFactInput({ value: info[field] });
  }
}

const EMPTY_VALUES: Required<BasicInfoInput> = {
  displayName: "",
  fullName: "",
  age: "",
  ageApproximate: false,
  genderIdentity: "",
  genderOther: "",
  pronouns: "",
  species: "",
  occupation: "",
};

/** Turn a sheet into form values. Fields the form cannot represent are locked. */
export function toBasicInfoForm(facts: CharacterFacts): BasicInfoFormState {
  const values = { ...EMPTY_VALUES, displayName: facts.displayName };
  const locked: BasicInfoFormState["locked"] = {};

  for (const [field, key] of Object.entries(BASIC_FACT_KEYS) as [BasicFactField, string][]) {
    const fact = facts.values[key];
    if (!fact) continue;
    if (fact.state !== "specified") {
      locked[field] = fact.state;
      continue;
    }
    const value = fact.value as unknown;
    if (field === "age") {
      const age = value as { value: number; unit: string; approximate?: boolean };
      if (age.unit !== "years" || !Number.isInteger(age.value) || age.value < 0) {
        locked.age = "unsupported";
        continue;
      }
      values.age = String(age.value);
      values.ageApproximate = age.approximate === true;
    } else if (field === "genderIdentity") {
      const choice = value as { option?: string; other?: string };
      if (choice.other !== undefined) {
        values.genderIdentity = GENDER_OTHER;
        values.genderOther = choice.other;
      } else {
        values.genderIdentity = choice.option ?? "";
      }
    } else {
      values[field] = String(value);
    }
  }
  return { values, locked };
}

/**
 * Apply validated basic info to a sheet. Every other fact (and every locked field) is kept
 * exactly as stored; a field whose value did not change keeps its original fact object.
 */
export function applyBasicInfo(facts: CharacterFacts, info: BasicInfo): CharacterFacts {
  const { locked } = toBasicInfoForm(facts);
  const values = { ...facts.values };

  for (const [field, key] of Object.entries(BASIC_FACT_KEYS) as [BasicFactField, string][]) {
    if (locked[field]) continue;
    const next = factFor(field, info);
    const current = values[key];
    if (canonicalJson(next) === canonicalJson(current)) continue;
    if (next === undefined) delete values[key];
    else values[key] = next;
  }
  return { ...facts, displayName: info.displayName, values };
}

/** A new sheet holding only the basic info. Source language stays unknown (never guessed). */
export function createFactsFromBasicInfo(info: BasicInfo): CharacterFacts {
  return applyBasicInfo(
    { schemaVersion: CHARACTER_FACTS_SCHEMA_VERSION, displayName: info.displayName, values: {} },
    info,
  );
}

/** Short summary for cards: species · age · occupation, only from specified facts. */
export function summarizeCharacter(values: Record<string, unknown>): string[] {
  const parts: string[] = [];
  const specified = (key: string) => {
    const fact = values[key] as { state?: string; value?: unknown } | undefined;
    return fact?.state === "specified" ? fact.value : undefined;
  };
  const species = specified(BASIC_FACT_KEYS.species);
  if (typeof species === "string") parts.push(species);
  const age = specified(BASIC_FACT_KEYS.age) as
    { value?: unknown; unit?: unknown; approximate?: unknown } | undefined;
  if (age && typeof age.value === "number" && (age.unit === "years" || age.unit === "months")) {
    parts.push(messages.characters.ageValue(age.value, age.approximate === true, age.unit));
  }
  const occupation = specified(BASIC_FACT_KEYS.occupation);
  if (typeof occupation === "string") parts.push(occupation);
  return parts;
}
