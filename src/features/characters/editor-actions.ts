"use server";

import { z } from "zod";

import { getDb } from "@/db";
import { messages } from "@/i18n";
import { type ActionResult, fail, failFromError, invalidInput, ok } from "@/lib/action-result";

import type { CharacterFacts, MigrationReviewItem } from "./domain";
import { createCharacterRepository } from "./server/character-repository";

const targetSchema = z.object({
  id: z.uuid(),
  revision: z.int().min(1),
  reviewConfirmed: z.boolean(),
});

/** Only the outer shape is checked here; the repository validates the full sheet. */
const sheetSchema = z.looseObject({ values: z.record(z.string(), z.unknown()) });

export type LatestCharacter = {
  facts: CharacterFacts;
  revision: number;
  pendingMigration?: { fromVersion: number; review: MigrationReviewItem[] };
};

/**
 * Autosave of the Fact Editor. Writes the whole sheet if `revision` is still current — otherwise
 * `revision_conflict` and nothing is written. A sheet migrated from an older version with items to
 * review is only written once the user has confirmed the review (`reviewConfirmed`), so the
 * review is never resolved behind their back. No `refresh()`: the editor keeps its own state.
 */
export async function saveCharacterFactsAction(
  id: unknown,
  revision: unknown,
  facts: unknown,
  reviewConfirmed: unknown = false,
): Promise<ActionResult<{ revision: number; savedAt: string }>> {
  const target = targetSchema.safeParse({ id, revision, reviewConfirmed });
  if (!target.success) return invalidInput(target.error);
  const sheet = sheetSchema.safeParse(facts);
  if (!sheet.success) return invalidInput(sheet.error);

  const repository = createCharacterRepository(getDb());
  try {
    const current = await repository.getById(target.data.id);
    if ((current.pendingMigration?.review.length ?? 0) > 0 && !target.data.reviewConfirmed) {
      return fail({
        code: "migration_review_required",
        message: messages.errors.migration_review_required,
      });
    }
    const saved = await repository.update(
      target.data.id,
      sheet.data as unknown as CharacterFacts,
      target.data.revision,
    );
    return ok({ revision: saved.revision, savedAt: saved.updatedAt.toISOString() });
  } catch (error) {
    return failFromError(error);
  }
}

/** The stored sheet as it is now, to resolve a revision conflict. */
export async function loadLatestCharacterAction(
  id: unknown,
): Promise<ActionResult<LatestCharacter>> {
  const parsed = z.uuid().safeParse(id);
  if (!parsed.success) return invalidInput(parsed.error);
  try {
    const record = await createCharacterRepository(getDb()).getById(parsed.data);
    return ok({
      facts: record.facts,
      revision: record.revision,
      ...(record.pendingMigration ? { pendingMigration: record.pendingMigration } : {}),
    });
  } catch (error) {
    return failFromError(error);
  }
}
