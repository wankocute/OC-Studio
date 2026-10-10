/**
 * Three-way merge used to resolve a revision conflict without overwriting another tab's work.
 *
 * A sheet is split into independent *parts*: each fact key, plus `displayName`,
 * `sourceLanguage` and the character's custom definitions. Local changes (base → local) are
 * re-applied on top of the latest stored sheet. A part changed both locally and elsewhere is an
 * *overlap*: it is only overwritten after the user confirms.
 */
import { type CharacterFacts, canonicalJson } from "@/features/characters/domain";

export const SHEET_PARTS = {
  displayName: "$displayName",
  sourceLanguage: "$sourceLanguage",
  custom: "$custom",
} as const;

function partValue(facts: CharacterFacts, part: string): unknown {
  switch (part) {
    case SHEET_PARTS.displayName:
      return facts.displayName;
    case SHEET_PARTS.sourceLanguage:
      return facts.sourceLanguage;
    case SHEET_PARTS.custom:
      return facts.custom;
    default:
      return facts.values[part];
  }
}

function allParts(...sheets: CharacterFacts[]): string[] {
  const keys = new Set<string>(Object.values(SHEET_PARTS));
  for (const sheet of sheets) for (const key of Object.keys(sheet.values)) keys.add(key);
  return [...keys];
}

/** Parts whose content differs between two sheets. */
export function changedParts(before: CharacterFacts, after: CharacterFacts): string[] {
  return allParts(before, after).filter(
    (part) => canonicalJson(partValue(before, part)) !== canonicalJson(partValue(after, part)),
  );
}

/** Set or remove an optional top-level property (absent, never `undefined`, when unset). */
export function withOptional<K extends "sourceLanguage" | "custom">(
  facts: CharacterFacts,
  key: K,
  value: CharacterFacts[K],
): CharacterFacts {
  const next = { ...facts };
  if (value === undefined) delete next[key];
  else next[key] = value;
  return next;
}

function withPart(facts: CharacterFacts, part: string, value: unknown): CharacterFacts {
  switch (part) {
    case SHEET_PARTS.displayName:
      return { ...facts, displayName: value as string };
    case SHEET_PARTS.sourceLanguage:
      return withOptional(facts, "sourceLanguage", value as string | undefined);
    case SHEET_PARTS.custom:
      return withOptional(facts, "custom", value as CharacterFacts["custom"]);
    default: {
      const values = { ...facts.values };
      if (value === undefined) delete values[part];
      else values[part] = value as CharacterFacts["values"][string];
      return { ...facts, values };
    }
  }
}

export type MergeResult = {
  merged: CharacterFacts;
  /** Parts the user changed locally. */
  local: string[];
  /** Parts changed both locally and in the latest sheet; local wins only after confirmation. */
  overlapping: string[];
};

/** Re-apply local changes (`base` → `local`) onto `latest`. Pure. */
export function mergeOntoLatest(
  base: CharacterFacts,
  local: CharacterFacts,
  latest: CharacterFacts,
): MergeResult {
  const localParts = changedParts(base, local);
  const remoteParts = new Set(changedParts(base, latest));
  let merged = latest;
  for (const part of localParts) merged = withPart(merged, part, partValue(local, part));
  return {
    merged,
    local: localParts,
    overlapping: localParts.filter(
      (part) =>
        remoteParts.has(part) &&
        canonicalJson(partValue(latest, part)) !== canonicalJson(partValue(local, part)),
    ),
  };
}
