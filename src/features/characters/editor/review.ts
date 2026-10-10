/**
 * Review of facts migrated from an older schema (`pendingMigration.review`).
 *
 * Nothing is inferred: every item needs an explicit decision from the user, and the review only
 * counts as resolved once all decisions are made and confirmed. Until then the editor does not
 * save, so the stored sheet keeps its old version and the review list stays available.
 */
import {
  allowsExplicitNone,
  type CharacterFacts,
  createFieldResolver,
  type DefinitionContext,
  LEGACY_GENDER_KEY,
  type MigrationReviewItem,
} from "@/features/characters/domain";

export type ReviewDecision =
  /** Leave the fact exactly as stored. */
  | "keep"
  /** `not_applicable` really meant "the character has none". */
  | "explicit_none"
  /** Remove the fact (unspecified); the user enters a value in the field. */
  | "clear";

export type ReviewDecisions = Record<string, ReviewDecision>;

export const reviewItemId = (item: MigrationReviewItem) => `${item.key}:${item.reason}`;

/** Decisions offered for an item, in display order. */
export function reviewChoices(
  item: MigrationReviewItem,
  facts: CharacterFacts,
  context: DefinitionContext,
): ReviewDecision[] {
  if (item.reason === "ambiguous_gender") return ["keep", "clear"];
  const definition = createFieldResolver(facts.custom, context)(item.key);
  return definition && allowsExplicitNone(definition)
    ? ["keep", "explicit_none", "clear"]
    : ["keep", "clear"];
}

export function isReviewComplete(
  items: readonly MigrationReviewItem[],
  decisions: ReviewDecisions,
): boolean {
  return items.every((item) => decisions[reviewItemId(item)] !== undefined);
}

/**
 * Apply confirmed decisions. Pure; throws if a decision is missing (the UI only enables
 * confirmation once every item is decided).
 */
export function applyReviewDecisions(
  facts: CharacterFacts,
  items: readonly MigrationReviewItem[],
  decisions: ReviewDecisions,
): CharacterFacts {
  const values = { ...facts.values };
  for (const item of items) {
    const decision = decisions[reviewItemId(item)];
    if (decision === undefined) throw new Error(`Missing review decision for ${item.key}.`);
    if (decision === "keep") continue;
    // The user already changed this fact in the form: their edit wins over the review choice.
    if (
      item.reason === "not_applicable_may_mean_none" &&
      values[item.key]?.state !== "not_applicable"
    ) {
      continue;
    }
    if (decision === "clear") {
      delete values[item.key];
      continue;
    }
    // Only offered for `not_applicable_may_mean_none` on fields that allow explicit_none.
    if (item.key !== LEGACY_GENDER_KEY) values[item.key] = { state: "explicit_none" };
  }
  return { ...facts, values };
}
