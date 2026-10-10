import type { FieldScope } from "@/features/characters/domain";

import type { EditorGroup } from "./layout";

export type GroupChoice = { id: string; label: string; scope: FieldScope; topLevel: boolean };

/** Every group and sub-group as a flat, labelled list ("Ngoại hình › Mái tóc"). */
export function flattenGroups(groups: readonly EditorGroup[]): GroupChoice[] {
  return groups.flatMap((group) => [
    { id: group.id, label: group.label, scope: group.scope, topLevel: true },
    ...group.subgroups.map((subgroup) => ({
      id: subgroup.id,
      label: `${group.label} › ${subgroup.label}`,
      scope: subgroup.scope,
      topLevel: false,
    })),
  ]);
}

/**
 * Groups a field definition may be placed in: library definitions cannot depend on one
 * character's own groups.
 */
export function placementGroups(
  groups: readonly EditorGroup[],
  scope: Exclude<FieldScope, "builtin">,
): GroupChoice[] {
  return flattenGroups(groups).filter(
    (group) => scope === "character" || group.scope !== "character",
  );
}
