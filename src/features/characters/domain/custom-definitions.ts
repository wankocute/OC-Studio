/**
 * Custom field definitions in two scopes (Q1):
 *
 * - character scope — `custom.<id>` fields / `cg_<id>` groups, stored in one fact sheet;
 * - library scope   — `lib.<id>` fields / `lg_<id>` groups, defined once and reused. Stored
 *   outside the fact sheet; callers resolve them and pass them in (`DefinitionContext`).
 *
 * The scope is encoded in the key prefix, so resolution is deterministic and a key can never
 * map to two definitions. No module-level registry: everything is passed explicitly.
 */
import { NAMESPACES } from "./constants";
import { getBuiltinField, getBuiltinGroup } from "./definitions";
import type {
  CustomDefinitions,
  CustomGroupDefinition,
  DefinitionContext,
  FieldConfig,
  FieldDefinition,
  FieldMeta,
  FieldScope,
  LeafConfig,
  SubfieldDefinition,
} from "./types";

export function fieldScopeOf(key: string): FieldScope {
  if (key.startsWith(NAMESPACES.characterField)) return "character";
  if (key.startsWith(NAMESPACES.libraryField)) return "library";
  return "builtin";
}

export type FieldResolver = (key: string) => FieldDefinition | undefined;

/** Resolve a field key in the scope its prefix names — nowhere else. */
export function createFieldResolver(
  custom: CustomDefinitions | undefined,
  context: DefinitionContext = {},
): FieldResolver {
  const character = new Map(custom?.fields.map((definition) => [definition.key, definition]));
  const library = new Map(
    context.library?.fields.map((definition) => [definition.key, definition]),
  );
  return (key) => {
    switch (fieldScopeOf(key)) {
      case "character":
        return character.get(key);
      case "library":
        return library.get(key);
      case "builtin":
        return getBuiltinField(key);
    }
  };
}

/** Look up a group (built-in, character-scoped or library-scoped). */
export function createGroupResolver(
  custom: CustomDefinitions | undefined,
  context: DefinitionContext = {},
): (id: string) => { readonly id: string; readonly parent?: string } | undefined {
  const groups = new Map<string, CustomGroupDefinition>();
  for (const group of custom?.groups ?? []) groups.set(group.id, group);
  for (const group of context.library?.groups ?? []) groups.set(group.id, group);
  return (id) => getBuiltinGroup(id) ?? groups.get(id);
}

/**
 * Resolve a field definition: built-in, then the sheet's custom fields, then library fields.
 * Kept for TASK 02 callers; prefer `createFieldResolver` when resolving many keys.
 */
export function findFieldDefinition(
  key: string,
  custom: CustomDefinitions | undefined,
  context?: DefinitionContext,
): FieldDefinition | undefined {
  return createFieldResolver(custom, context)(key);
}

// ---------------------------------------------------------------------------
// Compatible edits (Q1: editing a definition must never invalidate existing values)
// ---------------------------------------------------------------------------

export type BreakingChange = {
  /** Dot path inside the definition, e.g. `kind`, `options.moon`, `fields.cost.kind`. */
  path: string;
  reason:
    | "kind_changed"
    | "option_removed"
    | "other_disallowed"
    | "unit_removed"
    | "range_narrowed"
    | "integer_required"
    | "subfield_removed"
    | "subfield_now_required"
    | "max_items_lowered"
    | "explicit_none_disallowed";
};

function leafBreakingChanges(prev: LeafConfig, next: LeafConfig, path: string): BreakingChange[] {
  if (prev.kind !== next.kind) return [{ path: `${path}kind`, reason: "kind_changed" }];
  const changes: BreakingChange[] = [];

  if (
    (prev.kind === "single_select" || prev.kind === "multi_select") &&
    (next.kind === "single_select" || next.kind === "multi_select")
  ) {
    const kept = new Set(next.options.map((option) => option.code));
    for (const option of prev.options) {
      if (!kept.has(option.code)) {
        changes.push({ path: `${path}options.${option.code}`, reason: "option_removed" });
      }
    }
    if (prev.allowOther && !next.allowOther) {
      changes.push({ path: `${path}allowOther`, reason: "other_disallowed" });
    }
  }

  if (prev.kind === "measure" && next.kind === "measure") {
    for (const unit of prev.units) {
      if (!next.units.includes(unit)) {
        changes.push({ path: `${path}units.${unit}`, reason: "unit_removed" });
      }
    }
  }

  if (
    (prev.kind === "number" || prev.kind === "measure") &&
    (next.kind === "number" || next.kind === "measure")
  ) {
    const raisedMin = next.min !== undefined && (prev.min === undefined || next.min > prev.min);
    const loweredMax = next.max !== undefined && (prev.max === undefined || next.max < prev.max);
    if (raisedMin) changes.push({ path: `${path}min`, reason: "range_narrowed" });
    if (loweredMax) changes.push({ path: `${path}max`, reason: "range_narrowed" });
  }

  if (prev.kind === "number" && next.kind === "number" && !prev.integer && next.integer) {
    changes.push({ path: `${path}integer`, reason: "integer_required" });
  }
  return changes;
}

function subfieldBreakingChanges(
  prev: readonly SubfieldDefinition[],
  next: readonly SubfieldDefinition[],
): BreakingChange[] {
  const changes: BreakingChange[] = [];
  const nextByKey = new Map(next.map((subfield) => [subfield.key, subfield]));
  for (const before of prev) {
    const after = nextByKey.get(before.key);
    const path = `fields.${before.key}.`;
    if (!after) {
      changes.push({ path: `fields.${before.key}`, reason: "subfield_removed" });
      continue;
    }
    changes.push(...leafBreakingChanges(before, after, path));
  }
  const prevKeys = new Set(prev.map((subfield) => subfield.key));
  for (const after of next) {
    const wasRequired = prev.find((subfield) => subfield.key === after.key)?.required ?? false;
    // A new or newly required sub-field would make existing items invalid.
    if (after.required && (!prevKeys.has(after.key) || !wasRequired)) {
      changes.push({ path: `fields.${after.key}.required`, reason: "subfield_now_required" });
    }
  }
  return changes;
}

function configBreakingChanges(prev: FieldConfig, next: FieldConfig): BreakingChange[] {
  if (prev.kind !== next.kind) return [{ path: "kind", reason: "kind_changed" }];
  if (prev.kind === "object_list" && next.kind === "object_list") {
    const changes = subfieldBreakingChanges(prev.fields, next.fields);
    if ((next.maxItems ?? Infinity) < (prev.maxItems ?? Infinity)) {
      changes.push({ path: "maxItems", reason: "max_items_lowered" });
    }
    return changes;
  }
  if (prev.kind === "object" && next.kind === "object") {
    return subfieldBreakingChanges(prev.fields, next.fields);
  }
  return leafBreakingChanges(prev as LeafConfig, next as LeafConfig, "");
}

/** Any field definition, or just its config (labels and placement are ignored). */
export type EditableDefinition = FieldConfig &
  FieldMeta & {
    readonly key?: string;
    readonly group?: string;
    readonly label?: string;
    readonly description?: string;
    readonly version?: number;
  };

/**
 * Changes that could make values written under `prev` invalid under `next`.
 * Empty ⇒ the edit is compatible and may keep the same key (bump `version` for library fields).
 * Non-empty ⇒ the edit must be rejected, or saved as a new definition with a new key.
 * Labels, descriptions, group, sensitivity and new optional sub-fields/options are compatible.
 */
export function findBreakingChanges(
  prev: EditableDefinition,
  next: EditableDefinition,
): BreakingChange[] {
  const changes = configBreakingChanges(prev, next);
  if (prev.allowExplicitNone && !next.allowExplicitNone) {
    changes.push({ path: "allowExplicitNone", reason: "explicit_none_disallowed" });
  }
  return changes;
}
