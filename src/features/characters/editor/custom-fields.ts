/**
 * Custom field and group management (Q1): character-scoped definitions live in
 * `facts.custom`; library-scoped ones are stored separately and passed in as context.
 *
 * The form edits a `DefinitionDraft` (plain strings and flags). Keys, option codes and sub-field
 * keys are generated once and never derived from labels, so renaming never touches stored values.
 * Edits of a definition that already has values must pass `findBreakingChanges`.
 */
import {
  type BreakingChange,
  type CharacterFacts,
  type CustomDefinitions,
  type CustomFieldDefinition,
  type CustomGroupDefinition,
  type FieldConfig,
  type FieldDefinition,
  type FieldKind,
  findBreakingChanges,
  type LeafConfig,
  type LeafKind,
  type LibraryDefinitions,
  type LibraryFieldDefinition,
  parseCharacterFacts,
  parseLibraryDefinitions,
  type SubfieldDefinition,
} from "@/features/characters/domain";

import { parseNumberInput } from "./drafts";
import { withOptional } from "./merge";

export const FIELD_KINDS = [
  "short_text",
  "long_text",
  "number",
  "measure",
  "boolean",
  "date",
  "single_select",
  "multi_select",
  "text_list",
  "character_ref",
  "character_ref_list",
  "object",
  "object_list",
] as const satisfies readonly FieldKind[];

export const LEAF_KINDS = FIELD_KINDS.filter(
  (kind): kind is LeafKind => kind !== "object" && kind !== "object_list",
);

/** Unit codes the UI offers (labels from the fact label dictionary). */
export const KNOWN_UNITS = ["cm", "m", "in", "ft", "kg", "lb", "years", "months"] as const;

export type OptionDraft = { code: string; label: string };

export type LeafConfigDraft = {
  kind: LeafKind;
  options: OptionDraft[];
  allowOther: boolean;
  integer: boolean;
  min: string;
  max: string;
  units: string[];
};

export type SubfieldDraft = LeafConfigDraft & {
  key: string;
  label: string;
  required: boolean;
  sensitive: boolean;
};

export type DefinitionDraft = Omit<LeafConfigDraft, "kind"> & {
  kind: FieldKind;
  label: string;
  description: string;
  group: string;
  sensitive: boolean;
  allowExplicitNone: boolean;
  subfields: SubfieldDraft[];
};

// ---------------------------------------------------------------------------
// Definition ⇄ draft
// ---------------------------------------------------------------------------

const EMPTY_LEAF: Omit<LeafConfigDraft, "kind"> = {
  options: [],
  allowOther: false,
  integer: false,
  min: "",
  max: "",
  units: [],
};

export function emptyDefinitionDraft(group: string): DefinitionDraft {
  return {
    ...EMPTY_LEAF,
    kind: "short_text",
    label: "",
    description: "",
    group,
    sensitive: false,
    allowExplicitNone: false,
    subfields: [],
  };
}

export function emptySubfieldDraft(key: string): SubfieldDraft {
  return { ...EMPTY_LEAF, kind: "short_text", key, label: "", required: false, sensitive: false };
}

const boundText = (value: number | undefined) => (value === undefined ? "" : String(value));

function leafConfigToDraft(config: LeafConfig): LeafConfigDraft {
  const draft: LeafConfigDraft = { ...EMPTY_LEAF, kind: config.kind };
  if (config.kind === "single_select" || config.kind === "multi_select") {
    draft.options = config.options.map((option) => ({
      code: option.code,
      label: option.label ?? "",
    }));
    draft.allowOther = config.allowOther === true;
  }
  if (config.kind === "number") draft.integer = config.integer === true;
  if (config.kind === "number" || config.kind === "measure") {
    draft.min = boundText(config.min);
    draft.max = boundText(config.max);
  }
  if (config.kind === "measure") draft.units = [...config.units];
  return draft;
}

export function definitionToDraft(
  definition: CustomFieldDefinition | LibraryFieldDefinition,
): DefinitionDraft {
  const composite = definition.kind === "object" || definition.kind === "object_list";
  return {
    ...(composite ? { ...EMPTY_LEAF } : leafConfigToDraft(definition as LeafConfig)),
    kind: definition.kind,
    label: definition.label,
    description: definition.description ?? "",
    group: definition.group,
    sensitive: definition.sensitivity === "sensitive",
    allowExplicitNone: definition.allowExplicitNone === true,
    subfields: composite
      ? (definition as { fields: readonly SubfieldDefinition[] }).fields.map((subfield) => ({
          ...leafConfigToDraft(subfield),
          key: subfield.key,
          label: subfield.label ?? "",
          required: subfield.required === true,
          sensitive: subfield.sensitivity === "sensitive",
        }))
      : [],
  };
}

const trimmed = (text: string) => text.normalize("NFC").trim();

function draftToLeafConfig(draft: LeafConfigDraft): LeafConfig {
  const bounds = () => {
    const min = parseNumberInput(draft.min);
    const max = parseNumberInput(draft.max);
    return { ...(min === undefined ? {} : { min }), ...(max === undefined ? {} : { max }) };
  };
  switch (draft.kind) {
    case "single_select":
    case "multi_select":
      return {
        kind: draft.kind,
        options: draft.options.map((option) => ({
          code: option.code,
          label: trimmed(option.label),
        })),
        ...(draft.allowOther ? { allowOther: true } : {}),
      };
    case "number":
      return { kind: "number", ...(draft.integer ? { integer: true } : {}), ...bounds() };
    case "measure":
      return { kind: "measure", units: [...draft.units], ...bounds() };
    default:
      return { kind: draft.kind };
  }
}

function draftToConfig(draft: DefinitionDraft): FieldConfig {
  if (draft.kind === "object" || draft.kind === "object_list") {
    const fields: SubfieldDefinition[] = draft.subfields.map((subfield) => ({
      ...draftToLeafConfig(subfield),
      key: subfield.key,
      label: trimmed(subfield.label),
      ...(subfield.required ? { required: true } : {}),
      ...(subfield.sensitive ? { sensitivity: "sensitive" as const } : {}),
    }));
    return { kind: draft.kind, fields };
  }
  return draftToLeafConfig({ ...draft, kind: draft.kind });
}

/** The definition a draft describes (unvalidated). `version` is added by the caller. */
export function draftToDefinition(draft: DefinitionDraft, key: string): CustomFieldDefinition {
  const description = trimmed(draft.description);
  return {
    ...draftToConfig(draft),
    key,
    group: draft.group,
    label: trimmed(draft.label),
    ...(description ? { description } : {}),
    ...(draft.sensitive ? { sensitivity: "sensitive" as const } : {}),
    ...(draft.allowExplicitNone ? { allowExplicitNone: true } : {}),
  } as CustomFieldDefinition;
}

// ---------------------------------------------------------------------------
// Validation of a draft
// ---------------------------------------------------------------------------

/** Draft error key: `label`, `group`, `options.<i>`, `subfields.<i>.label`, `form`… */
export type DefinitionErrors = Record<string, string>;

function draftErrorKey(path: readonly PropertyKey[]): string {
  const [property, index, ...rest] = path;
  if (property === "options") return `options.${String(index)}`;
  if (property === "fields" && typeof index === "number") {
    const [subProperty, optionIndex] = rest;
    if (subProperty === "options") return `subfields.${index}.options.${String(optionIndex)}`;
    return `subfields.${index}.${String(subProperty ?? "label")}`;
  }
  if (property === "units" || property === "min" || property === "max") return String(property);
  if (property === "label" || property === "group" || property === "description") {
    return String(property);
  }
  return "form";
}

function collectDefinitionErrors(
  issues: readonly { path: PropertyKey[]; message: string }[],
  prefix: readonly PropertyKey[],
): DefinitionErrors {
  const errors: DefinitionErrors = {};
  for (const issue of issues) {
    const matches = prefix.every((part, index) => issue.path[index] === part);
    const key = matches ? draftErrorKey(issue.path.slice(prefix.length)) : "form";
    errors[key] ??= issue.message;
  }
  return errors;
}

/** Validate a character-scoped definition in the context of the whole sheet. */
export function validateCustomDefinition(
  facts: CharacterFacts,
  definition: CustomFieldDefinition,
  library: LibraryDefinitions,
): DefinitionErrors {
  const next = upsertCustomField(facts, definition);
  const index = next.custom!.fields.findIndex((field) => field.key === definition.key);
  const result = parseCharacterFacts(next, { library });
  if (result.success) return {};
  const relevant = result.error.issues.filter(
    (issue) =>
      (issue.path[0] === "custom" && issue.path[2] === index) ||
      (issue.path[0] === "values" && issue.path[1] === definition.key),
  );
  if (relevant.length === 0) return {};
  return collectDefinitionErrors(relevant, ["custom", "fields", index]);
}

/** Validate a library definition together with the rest of the library. */
export function validateLibraryDefinition(
  library: LibraryDefinitions,
  definition: LibraryFieldDefinition,
): DefinitionErrors {
  const exists = library.fields.some((field) => field.key === definition.key);
  const fields = exists
    ? library.fields.map((field) => (field.key === definition.key ? definition : field))
    : [...library.fields, definition];
  const result = parseLibraryDefinitions({ ...library, fields });
  if (result.success) return {};
  const index = fields.findIndex((field) => field.key === definition.key);
  const relevant = result.error.issues.filter(
    (issue) => issue.path[0] !== "fields" || issue.path[1] === index,
  );
  return collectDefinitionErrors(relevant, ["fields", index]);
}

/** Breaking changes of an edit; only relevant when the definition already has values. */
export function breakingChangesOf(
  previous: FieldDefinition,
  next: FieldDefinition,
): BreakingChange[] {
  return findBreakingChanges(previous, next);
}

// ---------------------------------------------------------------------------
// Character-scoped groups and fields (pure updates of `facts.custom`)
// ---------------------------------------------------------------------------

function customOf(facts: CharacterFacts): CustomDefinitions {
  return facts.custom ?? { groups: [], fields: [] };
}

/** Keeps `custom` absent when it holds nothing, so an unused feature leaves no trace. */
function withCustom(facts: CharacterFacts, custom: CustomDefinitions): CharacterFacts {
  const empty = custom.groups.length === 0 && custom.fields.length === 0;
  return withOptional(facts, "custom", empty ? undefined : custom);
}

export function upsertCustomField(
  facts: CharacterFacts,
  definition: CustomFieldDefinition,
): CharacterFacts {
  const custom = customOf(facts);
  const exists = custom.fields.some((field) => field.key === definition.key);
  return withCustom(facts, {
    ...custom,
    fields: exists
      ? custom.fields.map((field) => (field.key === definition.key ? definition : field))
      : [...custom.fields, definition],
  });
}

/** Remove a character-scoped field together with its value (the user confirmed both). */
export function removeCustomField(facts: CharacterFacts, key: string): CharacterFacts {
  const custom = customOf(facts);
  const values = { ...facts.values };
  delete values[key];
  return withCustom(
    { ...facts, values },
    { ...custom, fields: custom.fields.filter((field) => field.key !== key) },
  );
}

function swap<T>(items: readonly T[], from: number, to: number): T[] {
  const next = [...items];
  [next[from], next[to]] = [next[to]!, next[from]!];
  return next;
}

/** Move a field one step up/down among the custom fields of the same group. */
export function moveCustomField(
  facts: CharacterFacts,
  key: string,
  direction: -1 | 1,
): CharacterFacts {
  const custom = customOf(facts);
  const index = custom.fields.findIndex((field) => field.key === key);
  if (index === -1) return facts;
  const group = custom.fields[index]!.group;
  const sameGroup = custom.fields
    .map((field, position) => ({ field, position }))
    .filter(({ field }) => field.group === group);
  const at = sameGroup.findIndex(({ position }) => position === index);
  const neighbour = sameGroup[at + direction];
  if (!neighbour) return facts;
  return withCustom(facts, { ...custom, fields: swap(custom.fields, index, neighbour.position) });
}

export function addCustomGroup(
  facts: CharacterFacts,
  group: CustomGroupDefinition,
): CharacterFacts {
  const custom = customOf(facts);
  return withCustom(facts, { ...custom, groups: [...custom.groups, group] });
}

export function renameCustomGroup(
  facts: CharacterFacts,
  id: string,
  label: string,
): CharacterFacts {
  const custom = customOf(facts);
  return withCustom(facts, {
    ...custom,
    groups: custom.groups.map((group) => (group.id === id ? { ...group, label } : group)),
  });
}

export function moveCustomGroup(
  facts: CharacterFacts,
  id: string,
  direction: -1 | 1,
): CharacterFacts {
  const custom = customOf(facts);
  const index = custom.groups.findIndex((group) => group.id === id);
  const target = index + direction;
  if (index === -1 || target < 0 || target >= custom.groups.length) return facts;
  return withCustom(facts, { ...custom, groups: swap(custom.groups, index, target) });
}

/** A group can be removed only when no field and no sub-group uses it. */
export function canRemoveCustomGroup(
  facts: CharacterFacts,
  library: LibraryDefinitions,
  id: string,
): boolean {
  const custom = customOf(facts);
  return (
    !custom.fields.some((field) => field.group === id) &&
    !custom.groups.some((group) => group.parent === id) &&
    !library.fields.some((field) => field.group === id)
  );
}

export function removeCustomGroup(facts: CharacterFacts, id: string): CharacterFacts {
  const custom = customOf(facts);
  return withCustom(facts, { ...custom, groups: custom.groups.filter((group) => group.id !== id) });
}
