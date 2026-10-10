/**
 * Single source for Character Fact limits, versions and id namespaces.
 * Schemas, definitions and tests import from here — no magic numbers elsewhere.
 */

/** Current fact-sheet schema version. Migrations (v1 → v2 → v3): `migration.ts`. */
export const CHARACTER_FACTS_SCHEMA_VERSION = 3;

/** Validation limits (unchanged from TASK 02 unless noted). Text limits count UTF-16 code units. */
export const LIMITS = {
  displayName: 200,
  shortText: 300,
  longText: 20_000,
  /** text_list / character_ref_list items. */
  listItems: 200,
  /** Default object_list size. */
  objectListItems: 200,
  /** `history.events` allows more items than other object lists. */
  historyEvents: 500,
  /** Options per select field, and choices per multi_select value. */
  selectOptions: 100,
  unitsPerField: 20,
  subfields: 30,
  /** Per scope (character-scoped and library-scoped are counted separately). */
  customGroups: 30,
  customFields: 200,
  /** Length of codes, sub-field keys and the random part of ids. */
  identifierLength: 64,
  /** Element ids of repeated facts. */
  itemIdLength: 64,
  languageTagLength: 35,
} as const;

/**
 * Field key / group id namespaces. Prefixes are disjoint, so the scope of a key is known from
 * the key alone and one key can never resolve to two definitions.
 */
export const NAMESPACES = {
  characterField: "custom.",
  libraryField: "lib.",
  characterGroup: "cg_",
  libraryGroup: "lg_",
} as const;
