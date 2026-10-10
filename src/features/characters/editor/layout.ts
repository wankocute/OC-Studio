/**
 * Editor layout built from field definitions: which groups, sub-groups and fields exist, in which
 * order, with which labels. Nothing here is hard-coded per field — built-in, character-scoped and
 * library-scoped definitions all go through the same path, and visibility comes from the domain's
 * presentation rules (`getFieldVisibility`), which never touch facts.
 */
import {
  BUILTIN_FIELDS,
  BUILTIN_GROUPS,
  type CharacterFacts,
  type CustomGroupDefinition,
  factLabelsVi,
  type FieldDefinition,
  type FieldScope,
  fieldScopeOf,
  type FieldVisibility,
  getFieldVisibility,
  isSensitive,
  type LibraryDefinitions,
  type PresentationMode,
  type SelectOption,
  type SubfieldDefinition,
} from "@/features/characters/domain";

export type EditorField = {
  key: string;
  definition: FieldDefinition;
  scope: FieldScope;
  label: string;
  description?: string;
  /** Built-in deprecated field, or a library definition with status `deprecated`. */
  deprecated: boolean;
  sensitive: boolean;
};

export type EditorSection = {
  id: string;
  label: string;
  scope: FieldScope;
  fields: EditorField[];
};

export type EditorGroup = EditorSection & { subgroups: EditorSection[] };

export type LayoutInput = {
  custom: CharacterFacts["custom"];
  library: LibraryDefinitions;
  /** Library field keys whose definition is deprecated. */
  deprecatedLibraryKeys: ReadonlySet<string>;
};

const builtinLabels = factLabelsVi;

export function groupScopeOf(id: string): FieldScope {
  if (id.startsWith("cg_")) return "character";
  if (id.startsWith("lg_")) return "library";
  return "builtin";
}

function toField(definition: FieldDefinition, input: LayoutInput): EditorField {
  const scope = fieldScopeOf(definition.key);
  const builtinLabel = builtinLabels.fields[definition.key as keyof typeof builtinLabels.fields];
  const custom = "label" in definition ? definition : undefined;
  return {
    key: definition.key,
    definition,
    scope,
    label: custom?.label ?? builtinLabel ?? definition.key,
    ...(custom?.description ? { description: custom.description } : {}),
    deprecated:
      ("deprecated" in definition && definition.deprecated === true) ||
      input.deprecatedLibraryKeys.has(definition.key),
    sensitive: isSensitive(definition),
  };
}

/**
 * Every group of the sheet, in display order: built-in groups, then library groups, then the
 * character's own groups. Within a section: built-in fields, then library fields, then custom
 * fields, each in their definition order.
 */
export function buildEditorGroups(input: LayoutInput): EditorGroup[] {
  const customGroups: CustomGroupDefinition[] = [
    ...input.library.groups,
    ...(input.custom?.groups ?? []),
  ];
  const sections = new Map<string, EditorSection>();
  const section = (id: string, label: string): EditorSection => {
    const created: EditorSection = { id, label, scope: groupScopeOf(id), fields: [] };
    sections.set(id, created);
    return created;
  };

  const topLevel: { id: string; label: string }[] = [];
  const childrenOf = new Map<string, { id: string; label: string }[]>();
  const addGroup = (id: string, label: string, parent: string | undefined) => {
    section(id, label);
    if (parent === undefined) topLevel.push({ id, label });
    else childrenOf.set(parent, [...(childrenOf.get(parent) ?? []), { id, label }]);
  };

  for (const group of BUILTIN_GROUPS) {
    addGroup(
      group.id,
      builtinLabels.groups[group.id],
      "parent" in group ? group.parent : undefined,
    );
  }
  for (const group of customGroups) addGroup(group.id, group.label, group.parent);

  const definitions: FieldDefinition[] = [
    ...BUILTIN_FIELDS,
    ...input.library.fields,
    ...(input.custom?.fields ?? []),
  ];
  for (const definition of definitions) {
    sections.get(definition.group)?.fields.push(toField(definition, input));
  }

  return topLevel.map(({ id }) => ({
    ...sections.get(id)!,
    subgroups: (childrenOf.get(id) ?? []).map((child) => sections.get(child.id)!),
  }));
}

/** All fields of a group, including its sub-groups. */
export function fieldsOfGroup(group: EditorGroup): EditorField[] {
  return [...group.fields, ...group.subgroups.flatMap((subgroup) => subgroup.fields)];
}

export type VisibilityInput = {
  mode: PresentationMode;
  facts: Pick<CharacterFacts, "values" | "custom">;
  library: LibraryDefinitions;
  /** Library fields the user added to this character that have no value yet. */
  addedLibraryKeys: readonly string[];
};

/** Domain visibility for one field (template-free; added library fields count as listed). */
export function visibilityOf(field: EditorField, input: VisibilityInput): FieldVisibility {
  return getFieldVisibility(field.key, {
    mode: input.mode,
    facts: input.facts,
    definitions: { library: input.library },
    template: { libraryFields: [...input.addedLibraryKeys] },
  });
}

// ---------------------------------------------------------------------------
// Labels of sub-fields, options and units
// ---------------------------------------------------------------------------

export function subfieldLabel(fieldKey: string, subfield: SubfieldDefinition): string {
  return builtinLabels.subfields[`${fieldKey}.${subfield.key}`] ?? subfield.label ?? subfield.key;
}

/** `path` is the field key, or `<fieldKey>.<subKey>` for an option of a sub-field. */
export function optionLabel(path: string, option: SelectOption): string {
  return builtinLabels.options[path]?.[option.code] ?? option.label ?? option.code;
}

export function unitLabel(code: string): string {
  return builtinLabels.units[code] ?? code;
}
