/**
 * Fact-sheet migration between schema versions (in-memory / JSON only — not a DB migration).
 *
 * v1 → v2 → v3 are structural only: each version is a subset of the next (v2 adds explicit_none,
 * sourceLanguage and gender fields; v3 adds optional per-item sensitivity metadata), so values are
 * copied unchanged and only `schemaVersion` moves. Meaning is never guessed:
 * - `identity.gender` (v1) stays as is — it is now a deprecated field. Whether it was gender
 *   identity or biological sex is for the user to decide, so it is reported for review.
 * - `not_applicable` is never turned into `explicit_none`; where `explicit_none` would now be
 *   possible, the fact is reported so the user can re-check the original intent.
 * The input is never mutated; when migration is not safe the result is `rejected`.
 */
import type { z } from "zod";

import { CHARACTER_FACTS_SCHEMA_VERSION } from "./constants";
import { createFieldResolver } from "./custom-definitions";
import { allowsExplicitNone } from "./definitions";
import { parseCharacterFacts } from "./schemas";
import type { CharacterFacts, DefinitionContext } from "./types";

export const LEGACY_GENDER_KEY = "identity.gender";

export type MigrationReviewItem = {
  key: string;
  reason: "ambiguous_gender" | "not_applicable_may_mean_none";
};

export type MigrationResult =
  | { status: "current"; facts: CharacterFacts }
  | {
      status: "migrated";
      fromVersion: number;
      facts: CharacterFacts;
      review: MigrationReviewItem[];
    }
  | {
      status: "rejected";
      reason: "not_an_object" | "unsupported_version" | "invalid_source" | "invalid_result";
      issues?: z.core.$ZodIssue[];
    };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasAnyFact(
  sheet: Record<string, unknown>,
  test: (fact: Record<string, unknown>) => boolean,
) {
  const values = isRecord(sheet.values) ? Object.values(sheet.values) : [];
  return values.some((fact) => isRecord(fact) && test(fact));
}

/**
 * Features introduced *after* a version. Their presence in a sheet claiming that version means
 * the data is not genuine, so it is rejected rather than "migrated".
 */
const INTRODUCED_LATER: Record<number, (sheet: Record<string, unknown>) => boolean> = {
  // v2: sourceLanguage, explicit_none (+ v3 features)
  1: (sheet) =>
    "sourceLanguage" in sheet ||
    hasAnyFact(sheet, (fact) => fact.state === "explicit_none") ||
    INTRODUCED_LATER[2]!(sheet),
  // v3: per-item sensitivity (SEN-02)
  2: (sheet) => hasAnyFact(sheet, (fact) => "sensitiveItemIds" in fact),
};

function reviewItems(facts: CharacterFacts, context: DefinitionContext): MigrationReviewItem[] {
  const resolve = createFieldResolver(facts.custom, context);
  const review: MigrationReviewItem[] = [];
  for (const [key, fact] of Object.entries(facts.values)) {
    if (key === LEGACY_GENDER_KEY) {
      review.push({ key, reason: "ambiguous_gender" });
      continue;
    }
    const definition = resolve(key);
    if (fact.state === "not_applicable" && definition && allowsExplicitNone(definition)) {
      review.push({ key, reason: "not_applicable_may_mean_none" });
    }
  }
  return review;
}

/**
 * Bring a stored fact sheet to the current schema version.
 * Pass the library definitions the sheet uses, as for `parseCharacterFacts`.
 */
export function migrateCharacterFacts(
  input: unknown,
  context: DefinitionContext = {},
): MigrationResult {
  if (!isRecord(input)) return { status: "rejected", reason: "not_an_object" };

  if (input.schemaVersion === CHARACTER_FACTS_SCHEMA_VERSION) {
    const parsed = parseCharacterFacts(input, context);
    return parsed.success
      ? { status: "current", facts: parsed.data }
      : { status: "rejected", reason: "invalid_result", issues: parsed.error.issues };
  }

  const fromVersion = input.schemaVersion;
  if (typeof fromVersion !== "number" || !(fromVersion in INTRODUCED_LATER)) {
    return { status: "rejected", reason: "unsupported_version" };
  }
  if (INTRODUCED_LATER[fromVersion]!(input))
    return { status: "rejected", reason: "invalid_source" };

  // Every older version is a subset of the current one (v1 ⊂ v2 ⊂ v3): copy everything, change
  // only the version. Validation then proves the copy is a current sheet.
  const candidate = { ...input, schemaVersion: CHARACTER_FACTS_SCHEMA_VERSION };
  const parsed = parseCharacterFacts(candidate, context);
  if (!parsed.success) {
    return { status: "rejected", reason: "invalid_source", issues: parsed.error.issues };
  }
  return {
    status: "migrated",
    fromVersion,
    facts: parsed.data,
    // Review items concern v1 → v2 semantics only (gender split, explicit_none).
    review: fromVersion === 1 ? reviewItems(parsed.data, context) : [],
  };
}
