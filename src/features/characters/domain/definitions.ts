/**
 * Built-in Character Fact groups and fields.
 *
 * Definitions are language-neutral: labels live in `labels.vi.ts` (and future locales).
 * Keys are permanent — never rename or reuse a key. To retire a field, mark it `deprecated`
 * (values stay valid) and add a new key for the new meaning. Array order = display order.
 */
import { LIMITS } from "./constants";
import type {
  BuiltinFieldDefinition,
  BuiltinGroupDefinition,
  FieldConfig,
  FieldMeta,
  SelectOption,
} from "./types";

// --- small builders (keep literal key types for exhaustive label dictionaries) -------------

type FieldSpec = FieldConfig & FieldMeta & { readonly deprecated?: boolean };

function field<const K extends string, const G extends string, const C extends FieldSpec>(
  key: K,
  group: G,
  config: C,
): { readonly key: K; readonly group: G } & C {
  return { key, group, ...config };
}

function options<const C extends readonly string[]>(...codes: C) {
  return codes.map((code) => ({ code })) as { readonly [I in keyof C]: { readonly code: C[I] } };
}

const shortText = { kind: "short_text" } as const;
const longText = { kind: "long_text" } as const;
const textList = { kind: "text_list" } as const;
const date = { kind: "date" } as const;

// --- shared option sets & units ----------------------------------------------------------

export const LENGTH_UNITS = ["cm", "m", "in", "ft"] as const;
export const MASS_UNITS = ["kg", "lb"] as const;
export const AGE_UNITS = ["years", "months"] as const;

/** Options of the deprecated v1 `identity.gender` field. Kept so v1 values stay valid. */
export const GENDER_OPTIONS = options("female", "male", "non_binary");
export const GENDER_IDENTITY_OPTIONS = options("woman", "man", "non_binary", "agender");
export const BIOLOGICAL_SEX_OPTIONS = options("female", "male", "intersex");
export const SPEECH_PACE_OPTIONS = options(
  "very_slow",
  "slow",
  "moderate",
  "fast",
  "very_fast",
  "variable",
);
export const ECONOMIC_STATUS_OPTIONS = options(
  "poor",
  "lower_income",
  "middle_income",
  "upper_income",
  "wealthy",
);
export const PROFICIENCY_OPTIONS = options("novice", "competent", "proficient", "expert", "master");
export const RELATIONSHIP_TYPE_OPTIONS = options(
  "family",
  "romantic_partner",
  "friend",
  "rival",
  "enemy",
  "mentor",
  "mentee",
  "colleague",
  "ally",
  "acquaintance",
);
export const RELATIONSHIP_STATUS_OPTIONS = options("ongoing", "strained", "estranged", "ended");

// --- groups ------------------------------------------------------------------------------

export const BUILTIN_GROUPS = [
  { id: "identity" },
  { id: "appearance" },
  { id: "appearance.body", parent: "appearance" },
  { id: "appearance.skin", parent: "appearance" },
  { id: "appearance.face", parent: "appearance" },
  { id: "appearance.hair", parent: "appearance" },
  { id: "appearance.marks", parent: "appearance" },
  { id: "appearance.style", parent: "appearance" },
  { id: "personality" },
  { id: "psychology" },
  { id: "behavior" },
  { id: "background" },
  { id: "lifestyle" },
  { id: "history" },
  { id: "relationships" },
] as const satisfies readonly BuiltinGroupDefinition[];

export type BuiltinGroupId = (typeof BUILTIN_GROUPS)[number]["id"];

// --- fields ------------------------------------------------------------------------------

export const BUILTIN_FIELDS = [
  // Identity
  field("identity.full_name", "identity", shortText),
  field("identity.given_name", "identity", shortText),
  field("identity.family_name", "identity", { ...shortText, allowExplicitNone: true }),
  field("identity.common_name", "identity", shortText),
  field("identity.nicknames", "identity", textList),
  field("identity.other_names", "identity", {
    kind: "object_list",
    fields: [
      { key: "name", kind: "short_text", required: true },
      { key: "context", kind: "short_text" },
    ],
  }),
  field("identity.age", "identity", { kind: "measure", units: AGE_UNITS, min: 0 }),
  field("identity.apparent_age", "identity", shortText),
  field("identity.birth_date", "identity", date),
  // v1 combined field; ambiguous between identity and biological sex. Never reuse this key.
  field("identity.gender", "identity", {
    kind: "single_select",
    options: GENDER_OPTIONS,
    allowOther: true,
    deprecated: true,
  }),
  field("identity.gender_identity", "identity", {
    kind: "single_select",
    options: GENDER_IDENTITY_OPTIONS,
    allowOther: true,
  }),
  field("identity.biological_sex", "identity", {
    kind: "single_select",
    options: BIOLOGICAL_SEX_OPTIONS,
    allowOther: true,
  }),
  field("identity.pronouns", "identity", shortText),
  field("identity.nationality", "identity", { ...shortText, allowExplicitNone: true }),
  field("identity.species", "identity", shortText),
  field("identity.languages", "identity", textList),

  // Appearance
  field("appearance.overview", "appearance", longText),
  field("appearance.voice", "appearance", longText),
  field("appearance.height", "appearance.body", { kind: "measure", units: LENGTH_UNITS, min: 0 }),
  field("appearance.weight", "appearance.body", { kind: "measure", units: MASS_UNITS, min: 0 }),
  field("appearance.build", "appearance.body", shortText),
  field("appearance.body_proportions", "appearance.body", longText),
  field("appearance.skin_tone", "appearance.skin", shortText),
  field("appearance.skin_texture", "appearance.skin", shortText),
  field("appearance.face_shape", "appearance.face", shortText),
  field("appearance.eye_color", "appearance.face", shortText),
  field("appearance.eye_details", "appearance.face", longText),
  field("appearance.eyebrows", "appearance.face", shortText),
  field("appearance.nose", "appearance.face", shortText),
  field("appearance.lips", "appearance.face", shortText),
  field("appearance.hair_color", "appearance.hair", shortText),
  field("appearance.hair_length", "appearance.hair", shortText),
  field("appearance.hair_style", "appearance.hair", shortText),
  field("appearance.hair_texture", "appearance.hair", shortText),
  field("appearance.tattoos", "appearance.marks", {
    kind: "object_list",
    fields: [
      { key: "description", kind: "long_text" },
      { key: "location", kind: "short_text" },
      { key: "meaning", kind: "long_text" },
    ],
  }),
  field("appearance.scars", "appearance.marks", {
    kind: "object_list",
    fields: [
      { key: "description", kind: "long_text" },
      { key: "location", kind: "short_text" },
      { key: "origin", kind: "long_text", sensitivity: "sensitive" },
    ],
  }),
  field("appearance.piercings", "appearance.marks", {
    kind: "object_list",
    fields: [
      { key: "location", kind: "short_text" },
      { key: "description", kind: "short_text" },
    ],
  }),
  field("appearance.identifying_marks", "appearance.marks", {
    kind: "object_list",
    fields: [
      { key: "description", kind: "long_text" },
      { key: "location", kind: "short_text" },
    ],
  }),
  field("appearance.special_features", "appearance.marks", {
    kind: "object_list",
    fields: [
      { key: "name", kind: "short_text", required: true },
      { key: "description", kind: "long_text" },
    ],
  }),
  field("appearance.clothing_style", "appearance.style", longText),
  field("appearance.accessories", "appearance.style", {
    kind: "object_list",
    fields: [
      { key: "name", kind: "short_text", required: true },
      { key: "description", kind: "long_text" },
    ],
  }),

  // Personality
  field("personality.summary", "personality", longText),
  field("personality.core_traits", "personality", textList),
  field("personality.strengths", "personality", textList),
  field("personality.weaknesses", "personality", textList),
  field("personality.values", "personality", textList),
  field("personality.principles", "personality", textList),
  field("personality.likes", "personality", textList),
  field("personality.dislikes", "personality", textList),
  field("personality.contradictions", "personality", textList),
  field("personality.social_manner", "personality", longText),

  // Psychology
  field("psychology.motivations", "psychology", textList),
  field("psychology.goals", "psychology", textList),
  field("psychology.fears", "psychology", textList),
  field("psychology.desires", "psychology", textList),
  field("psychology.beliefs", "psychology", textList),
  field("psychology.internal_conflicts", "psychology", textList),
  field("psychology.wounds", "psychology", {
    kind: "object_list",
    sensitivity: "sensitive",
    fields: [
      { key: "description", kind: "long_text", required: true },
      { key: "note", kind: "long_text" },
    ],
  }),
  field("psychology.coping_mechanisms", "psychology", { ...textList, sensitivity: "sensitive" }),
  field("psychology.emotional_triggers", "psychology", {
    kind: "object_list",
    sensitivity: "sensitive",
    fields: [
      { key: "trigger", kind: "short_text", required: true },
      { key: "reaction", kind: "long_text" },
    ],
  }),

  // Behavior & communication
  field("behavior.habits", "behavior", textList),
  field("behavior.mannerisms", "behavior", textList),
  field("behavior.demeanor", "behavior", longText),
  field("behavior.stress_response", "behavior", longText),
  field("behavior.speech_style", "behavior", longText),
  field("behavior.speech_pace", "behavior", {
    kind: "single_select",
    options: SPEECH_PACE_OPTIONS,
    allowOther: true,
  }),
  field("behavior.verbal_tics", "behavior", textList),
  field("behavior.emotional_expression", "behavior", longText),
  field("behavior.situational_behaviors", "behavior", {
    kind: "object_list",
    fields: [
      { key: "situation", kind: "short_text", required: true },
      { key: "behavior", kind: "long_text", required: true },
    ],
  }),

  // Background
  field("background.birthplace", "background", shortText),
  field("background.hometown", "background", shortText),
  field("background.family", "background", longText),
  field("background.upbringing", "background", longText),
  field("background.education", "background", { ...longText, allowExplicitNone: true }),
  field("background.training", "background", { ...longText, allowExplicitNone: true }),
  field("background.economic_status", "background", {
    kind: "single_select",
    options: ECONOMIC_STATUS_OPTIONS,
    allowOther: true,
  }),
  field("background.culture", "background", longText),

  // Lifestyle
  field("lifestyle.occupation", "lifestyle", { ...shortText, allowExplicitNone: true }),
  field("lifestyle.residence", "lifestyle", { ...shortText, allowExplicitNone: true }),
  field("lifestyle.living_conditions", "lifestyle", longText),
  field("lifestyle.daily_routine", "lifestyle", longText),
  field("lifestyle.daily_activities", "lifestyle", textList),
  field("lifestyle.hobbies", "lifestyle", textList),
  field("lifestyle.interests", "lifestyle", textList),
  field("lifestyle.skills", "lifestyle", {
    kind: "object_list",
    fields: [
      { key: "name", kind: "short_text", required: true },
      { key: "proficiency", kind: "single_select", options: PROFICIENCY_OPTIONS },
      { key: "note", kind: "long_text" },
    ],
  }),

  // History
  field("history.events", "history", {
    kind: "object_list",
    maxItems: LIMITS.historyEvents,
    fields: [
      { key: "title", kind: "short_text", required: true },
      { key: "time", kind: "date" },
      { key: "description", kind: "long_text" },
      { key: "involved", kind: "character_ref_list" },
      { key: "impact", kind: "long_text" },
    ],
  }),

  // Relationships
  field("relationships.entries", "relationships", {
    kind: "object_list",
    fields: [
      { key: "person", kind: "character_ref", required: true },
      { key: "type", kind: "single_select", options: RELATIONSHIP_TYPE_OPTIONS, allowOther: true },
      {
        key: "status",
        kind: "single_select",
        options: RELATIONSHIP_STATUS_OPTIONS,
        allowOther: true,
      },
      { key: "description", kind: "long_text" },
      { key: "notes", kind: "long_text" },
    ],
  }),
] as const satisfies readonly BuiltinFieldDefinition[];

export type BuiltinFieldKey = (typeof BUILTIN_FIELDS)[number]["key"];

const builtinFieldsByKey: ReadonlyMap<string, BuiltinFieldDefinition> = new Map(
  BUILTIN_FIELDS.map((definition) => [definition.key, definition]),
);

const builtinGroupsById: ReadonlyMap<string, BuiltinGroupDefinition> = new Map(
  BUILTIN_GROUPS.map((group) => [group.id, group]),
);

export function getBuiltinField(key: string): BuiltinFieldDefinition | undefined {
  return builtinFieldsByKey.get(key);
}

export function getBuiltinGroup(id: string): BuiltinGroupDefinition | undefined {
  return builtinGroupsById.get(id);
}

/** Option codes of a select config, for validation. */
export function optionCodes(config: { readonly options: readonly SelectOption[] }): string[] {
  return config.options.map((option) => option.code);
}

/**
 * Collection kinds can always be confirmed empty ("no tattoos"); single-valued fields only when
 * the definition opts in ("no family name"), because for most of them (height, eye colour) "none"
 * is not a meaningful answer — `not_applicable` or a value is.
 */
const COLLECTION_KINDS: ReadonlySet<string> = new Set([
  "text_list",
  "character_ref_list",
  "object_list",
  "multi_select",
]);

export function allowsExplicitNone(definition: FieldConfig & FieldMeta): boolean {
  return COLLECTION_KINDS.has(definition.kind) || definition.allowExplicitNone === true;
}

export function isSensitive(definition: { readonly sensitivity?: string }): boolean {
  return definition.sensitivity === "sensitive";
}
