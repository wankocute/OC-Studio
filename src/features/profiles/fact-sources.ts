/**
 * Which facts a profile section is written from, computed from the one fact sheet and its
 * definitions — the profile stores only group ids and (on approval) fingerprints, never values.
 */
import {
  assessFactSnapshot,
  type CharacterFacts,
  computeFactFingerprints,
  DISPLAY_NAME_REF,
  type FactFingerprints,
  type FactSnapshot,
  fieldKeyOfRef,
  type LibraryDefinitions,
} from "@/features/characters/domain";
import { buildEditorGroups, fieldsOfGroup } from "@/features/characters/editor/layout";
import { messages } from "@/i18n";

import { sectionFactSnapshot } from "./domain";
import { aiSnapshotStale, isAiSnapshot } from "./ai/facts";

export type SourceGroupOption = { id: string; label: string };

export type FactSources = {
  facts: CharacterFacts;
  library: LibraryDefinitions;
  /** Top-level fact groups a section can be written from, in fact-editor order. */
  groups: SourceGroupOption[];
  fieldsByGroup: ReadonlyMap<string, readonly string[]>;
  /** Field key → label, for naming changed facts. */
  fieldLabels: ReadonlyMap<string, string>;
  fingerprints: FactFingerprints;
};

export function factSourcesOf(
  facts: CharacterFacts,
  library: LibraryDefinitions,
  deprecatedLibraryKeys: ReadonlySet<string> = new Set(),
): FactSources {
  const groups = buildEditorGroups({ custom: facts.custom, library, deprecatedLibraryKeys });
  const fieldLabels = new Map<string, string>();
  const fieldsByGroup = new Map<string, string[]>();
  for (const group of groups) {
    const fields = fieldsOfGroup(group);
    fieldsByGroup.set(
      group.id,
      fields.map((field) => field.key),
    );
    for (const field of fields) fieldLabels.set(field.key, field.label);
  }
  return {
    facts,
    library,
    groups: groups.map((group) => ({ id: group.id, label: group.label })),
    fieldsByGroup,
    fieldLabels,
    fingerprints: computeFactFingerprints(facts, { library }),
  };
}

export function snapshotForSection(sources: FactSources, sourceGroups: readonly string[]) {
  return sectionFactSnapshot(sourceGroups, sources.fieldsByGroup, sources.fingerprints);
}

export type FactFreshness =
  { status: "fresh" } | { status: "outdated"; labels: string[] } | { status: "incomparable" };

/** Whether the facts approved content was written from changed since it was approved. */
export function freshnessOf(snapshot: FactSnapshot, sources: FactSources): FactFreshness {
  if (isAiSnapshot(snapshot)) {
    return aiSnapshotStale(snapshot, sources.facts, { library: sources.library })
      ? {
          status: "outdated",
          labels: snapshot.scope.map((key) => sources.fieldLabels.get(key) ?? key),
        }
      : { status: "fresh" };
  }
  const assessment = assessFactSnapshot(snapshot, sources.fingerprints);
  if (assessment.status === "fresh") return { status: "fresh" };
  if (assessment.status === "incomparable") return { status: "incomparable" };
  const refs = [...assessment.changed, ...assessment.removed, ...assessment.added];
  const labels = [
    ...new Set(
      refs.map((ref) => {
        const key = fieldKeyOfRef(ref);
        if (key === DISPLAY_NAME_REF) return messages.characters.fields.displayName;
        return sources.fieldLabels.get(key) ?? key;
      }),
    ),
  ];
  return { status: "outdated", labels };
}
