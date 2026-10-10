/**
 * Character Fact domain types.
 *
 * Pure TypeScript: no React, Drizzle, pg or AI SDK imports. Usable on client and server.
 * Zod schemas in `schemas.ts` validate exactly these shapes (checked at compile time there).
 * Design rationale: docs/character-domain-decisions.md.
 */
import type { CHARACTER_FACTS_SCHEMA_VERSION } from "./constants";

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

/**
 * Whether a fact may be shared with AI by default. `sensitive` facts are excluded unless the
 * caller grants permission for that request (see `sensitivity.ts`). Absent = `standard`.
 */
export type Sensitivity = "standard" | "sensitive";

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
  /** A sensitive sub-field is stripped from every item unless the field is allowed. */
  readonly sensitivity?: Sensitivity;
};

export type FieldConfig =
  | LeafConfig
  | { readonly kind: "object"; readonly fields: readonly SubfieldDefinition[] }
  | {
      readonly kind: "object_list";
      readonly fields: readonly SubfieldDefinition[];
      readonly maxItems?: number;
    };

/** Metadata shared by every field definition, independent of its kind. */
export type FieldMeta = {
  readonly sensitivity?: Sensitivity;
  /**
   * Allow `explicit_none` on a single-valued field (e.g. "has no family name").
   * Collection kinds always allow it; see `allowsExplicitNone`.
   */
  readonly allowExplicitNone?: boolean;
};

export type BuiltinGroupDefinition = {
  /** Stable id, e.g. `appearance` or `appearance.hair`. */
  readonly id: string;
  /** Set for sub-groups. Only one level of sub-groups is allowed. */
  readonly parent?: string;
};

export type BuiltinFieldDefinition = FieldConfig &
  FieldMeta & {
    /** Stable technical key, never derived from a display label. */
    readonly key: string;
    /** Default group (top-level group or sub-group) the field is shown in. */
    readonly group: string;
    /**
     * Retired field: existing values stay valid and are preserved, but editors must not offer
     * it for new input. Its key is never reused.
     */
    readonly deprecated?: boolean;
  };

/** User-defined group. Character scope: `cg_<id>`; library scope: `lg_<id>`. */
export type CustomGroupDefinition = {
  /** Generated once, never changes. */
  readonly id: string;
  /** User-entered label; user content, never translated. */
  readonly label: string;
  /** Top-level group when this is a sub-group. */
  readonly parent?: string;
};

/** Character-scoped field: `custom.<id>`, stored inside one character's fact sheet. */
export type CustomFieldDefinition = FieldConfig &
  FieldMeta & {
    /** Generated once, never changes (renaming only changes `label`). */
    readonly key: string;
    readonly group: string;
    readonly label: string;
    readonly description?: string;
  };

/** Library-scoped field: `lib.<id>`, defined once and reusable by many characters. */
export type LibraryFieldDefinition = CustomFieldDefinition & {
  /**
   * Incremented on every saved edit. Only compatible edits are allowed on an existing key
   * (`findBreakingChanges`); incompatible ones require a new definition with a new key.
   */
  readonly version: number;
};

export type CustomDefinitions = {
  /** Array order = display order. */
  readonly groups: readonly CustomGroupDefinition[];
  /** Array order = display order (custom fields follow built-in fields in a shared group). */
  readonly fields: readonly CustomFieldDefinition[];
};

/** Library-scoped definitions resolved by the caller (e.g. loaded from storage) for validation. */
export type LibraryDefinitions = {
  readonly groups: readonly CustomGroupDefinition[];
  readonly fields: readonly LibraryFieldDefinition[];
};

export type FieldDefinition =
  BuiltinFieldDefinition | CustomFieldDefinition | LibraryFieldDefinition;

export type FieldScope = "builtin" | "character" | "library";

/** External context needed to validate / interpret a fact sheet. Passed explicitly, never global. */
export type DefinitionContext = {
  readonly library?: LibraryDefinitions;
};

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

/** Why an unlinked reference used to point at a library character. */
export type DetachedFrom = {
  /** Id of the library character the reference pointed at. Kept for audit only — never relinked. */
  characterId: string;
  reason: "character_deleted";
  /** ISO 8601 timestamp of the detach. */
  at: string;
};

/**
 * Either an OC in the library, or a character described only by text.
 * An `unlinked` ref with `detachedFrom` used to be linked to an OC that was deleted.
 */
export type CharacterRef =
  | { type: "character"; characterId: string }
  | { type: "unlinked"; name: string; note?: string; detachedFrom?: DetachedFrom };

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

/**
 * The four states of a fact. `unspecified` is never stored: it is the absence of a key.
 * - `explicit_none`: the user confirmed the character has none (no tattoos, no family name).
 * - `not_applicable`: the concept does not apply to this character (no hair colour for a slime).
 */
export type FactState = "specified" | "unspecified" | "explicit_none" | "not_applicable";

/** A stored fact. */
export type FactValue =
  | { state: "specified"; value: FactData }
  | { state: "explicit_none" }
  | { state: "not_applicable" };

/** The Character Fact sheet — the single source of truth for a character. */
export type CharacterFacts = {
  schemaVersion: typeof CHARACTER_FACTS_SCHEMA_VERSION;
  /** The only required fact: the name shown in the library. Independent of identity names. */
  displayName: string;
  /**
   * Default language of the user-entered text, as a canonical BCP 47 tag (`vi`, `en-US`).
   * Absent = unknown. Individual values may still be in other languages.
   */
  sourceLanguage?: string;
  /** Field key → fact. Keys absent here are `unspecified`. */
  values: Record<string, FactValue>;
  /** Character-scoped definitions. Library-scoped ones are resolved via `DefinitionContext`. */
  custom?: CustomDefinitions;
};
