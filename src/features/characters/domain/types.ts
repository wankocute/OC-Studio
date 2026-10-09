/**
 * Character Fact domain types.
 *
 * Pure TypeScript: no React, Drizzle, pg or AI SDK imports. Usable on client and server.
 * Zod schemas in `schemas.ts` validate exactly these shapes (checked at compile time there).
 * Design rationale: docs/character-domain-decisions.md.
 */

// ---------------------------------------------------------------------------
// Field definitions (the "shape" of a fact sheet)
// ---------------------------------------------------------------------------

/** Kinds that hold one non-nested value. Allowed at field level and inside objects. */
export type LeafKind =
  | "short_text"
  | "long_text"
  | "number"
  | "measure"
  | "boolean"
  | "date"
  | "single_select"
  | "multi_select"
  | "text_list"
  | "character_ref"
  | "character_ref_list";

/** Kinds whose sub-fields must be leaf kinds — this caps nesting at one level. */
export type CompositeKind = "object" | "object_list";

export type FieldKind = LeafKind | CompositeKind;

/** `label` is only used by custom definitions; built-in labels live in a locale dictionary. */
export type SelectOption = { readonly code: string; readonly label?: string };

export type LeafConfig =
  | { readonly kind: "short_text" }
  | { readonly kind: "long_text" }
  | {
      readonly kind: "number";
      readonly integer?: boolean;
      readonly min?: number;
      readonly max?: number;
    }
  | {
      readonly kind: "measure";
      /** Allowed unit codes, e.g. `["cm", "m"]`. */
      readonly units: readonly string[];
      readonly min?: number;
      readonly max?: number;
    }
  | { readonly kind: "boolean" }
  | { readonly kind: "date" }
  | {
      readonly kind: "single_select";
      readonly options: readonly SelectOption[];
      /** Allow a free-text answer outside the option list. */
      readonly allowOther?: boolean;
    }
  | {
      readonly kind: "multi_select";
      readonly options: readonly SelectOption[];
      readonly allowOther?: boolean;
    }
  | { readonly kind: "text_list" }
  | { readonly kind: "character_ref" }
  | { readonly kind: "character_ref_list" };

/** A property of an `object` / `object_list` field. */
export type SubfieldDefinition = LeafConfig & {
  /** Stable key, unique within the parent field. `id` is reserved. */
  readonly key: string;
  readonly label?: string;
  readonly required?: boolean;
};

export type FieldConfig =
  | LeafConfig
  | { readonly kind: "object"; readonly fields: readonly SubfieldDefinition[] }
  | {
      readonly kind: "object_list";
      readonly fields: readonly SubfieldDefinition[];
      readonly maxItems?: number;
    };

export type BuiltinGroupDefinition = {
  /** Stable id, e.g. `appearance` or `appearance.hair`. */
  readonly id: string;
  /** Set for sub-groups. Only one level of sub-groups is allowed. */
  readonly parent?: string;
};

export type BuiltinFieldDefinition = FieldConfig & {
  /** Stable technical key, never derived from a display label. */
  readonly key: string;
  /** Most specific group (top-level group or sub-group) the field is shown in. */
  readonly group: string;
};

export type CustomGroupDefinition = {
  /** `cg_<id>` — generated once, never changes. */
  readonly id: string;
  /** User-entered label; user content, never translated. */
  readonly label: string;
  /** Top-level group (built-in or custom) when this is a sub-group. */
  readonly parent?: string;
};

export type CustomFieldDefinition = FieldConfig & {
  /** `custom.<id>` — generated once, never changes (renaming only changes `label`). */
  readonly key: string;
  readonly group: string;
  readonly label: string;
  readonly description?: string;
};

export type CustomDefinitions = {
  /** Array order = display order. */
  readonly groups: readonly CustomGroupDefinition[];
  /** Array order = display order (custom fields follow built-in fields in a shared group). */
  readonly fields: readonly CustomFieldDefinition[];
};

export type FieldDefinition = BuiltinFieldDefinition | CustomFieldDefinition;

// ---------------------------------------------------------------------------
// Values
// ---------------------------------------------------------------------------

/** Stable id of a repeated element (list item, event, relationship…). */
export type ItemId = string;

export type Measure = {
  value: number;
  unit: string;
  /** "About 170 cm", "roughly 500 years". */
  approximate?: boolean;
};

/**
 * Partial calendar date (any of year / month / day may be missing) or a free-text
 * time reference for fictional calendars and relative times ("two winters after the war").
 */
export type FlexibleDate =
  | {
      type: "calendar";
      /** May be negative (BCE) or far in the future. */
      year?: number;
      month?: number;
      day?: number;
      approximate?: boolean;
    }
  | { type: "text"; text: string };

/** A chosen option code, or the user's own answer when the field allows "other". */
export type Choice = { option: string } | { other: string };

export type TextItem = { id: ItemId; text: string };

/** Either an OC in the library, or a character described only by text. */
export type CharacterRef =
  { type: "character"; characterId: string } | { type: "unlinked"; name: string; note?: string };

export type CharacterRefItem = { id: ItemId; ref: CharacterRef };

export type LeafValue =
  | string
  | number
  | boolean
  | Measure
  | FlexibleDate
  | Choice
  | Choice[]
  | TextItem[]
  | CharacterRef
  | CharacterRefItem[];

/** Value of an `object` field: sub-field key → value. Missing key = unspecified. */
export type ObjectValue = { [subKey: string]: LeafValue };

/** Element of an `object_list` field. */
export type ObjectItem = ObjectValue & { id: ItemId };

/** Value shape for each kind. */
export type ValueOfKind = {
  short_text: string;
  long_text: string;
  number: number;
  measure: Measure;
  boolean: boolean;
  date: FlexibleDate;
  single_select: Choice;
  multi_select: Choice[];
  text_list: TextItem[];
  character_ref: CharacterRef;
  character_ref_list: CharacterRefItem[];
  object: ObjectValue;
  object_list: ObjectItem[];
};

export type FactData = ValueOfKind[FieldKind];

/** All three states a fact can be in. `unspecified` is never stored: it is the absence of a key. */
export type FactState = "specified" | "unspecified" | "not_applicable";

/** A stored fact. */
export type FactValue = { state: "specified"; value: FactData } | { state: "not_applicable" };

export const CHARACTER_FACTS_SCHEMA_VERSION = 1;

/** The Character Fact sheet — the single source of truth for a character. */
export type CharacterFacts = {
  schemaVersion: typeof CHARACTER_FACTS_SCHEMA_VERSION;
  /** The only required fact: the name shown in the library. */
  displayName: string;
  /** Field key → fact. Keys absent here are `unspecified`. */
  values: Record<string, FactValue>;
  custom?: CustomDefinitions;
};
