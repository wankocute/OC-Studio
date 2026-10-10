/**
 * Fact-sheet migration between schema versions (in-memory / JSON only — not a DB migration).
 *
 * v1 → v2 is structural only: v1 data is a subset of v2, so values are copied unchanged and only
 * `schemaVersion` moves. Meaning is never guessed:
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

/** Features that did not exist in v1; their presence means the "v1" data is not genuine v1. */
function hasV2OnlyFeatures(sheet: Record<string, unknown>): boolean {
  if ("sourceLanguage" in sheet) return true;
  const values = isRecord(sheet.values) ? Object.values(sheet.values) : [];
  return values.some((fact) => isRecord(fact) && fact.state === "explicit_none");
}

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

  if (input.schemaVersion !== 1) return { status: "rejected", reason: "unsupported_version" };
  if (hasV2OnlyFeatures(input)) return { status: "rejected", reason: "invalid_source" };

  // v1 ⊂ v2: copy everything, change only the version. Validation then proves the copy is v2.
  const candidate = { ...input, schemaVersion: CHARACTER_FACTS_SCHEMA_VERSION };
  const parsed = parseCharacterFacts(candidate, context);
  if (!parsed.success) {
    return { status: "rejected", reason: "invalid_source", issues: parsed.error.issues };
  }
  return {
    status: "migrated",
    fromVersion: 1,
    facts: parsed.data,
    review: reviewItems(parsed.data, context),
  };
}
