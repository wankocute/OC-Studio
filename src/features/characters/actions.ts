"use server";

import { refresh } from "next/cache";
import { z } from "zod";

import { getDb } from "@/db";
import { isRepositoryError } from "@/db/repository-errors";
import { messages } from "@/i18n";
import { type ActionResult, fail, failFromError, invalidInput, ok } from "@/lib/action-result";

import { applyBasicInfo, basicInfoSchema, createFactsFromBasicInfo } from "./basic-info";
import { createCharacterRepository } from "./server/character-repository";

const idSchema = z.uuid();
const revisionSchema = z.int().min(1);

/** Create a character from basic info. The client navigates to it on success. */
export async function createCharacterAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = basicInfoSchema.safeParse(input);
  if (!parsed.success) return invalidInput(parsed.error);
  try {
    const record = await createCharacterRepository(getDb()).create(
      createFactsFromBasicInfo(parsed.data),
    );
    return ok({ id: record.id });
  } catch (error) {
    return failFromError(error);
  }
}

/**
 * Save basic info. Every other fact is re-read from the database and kept as stored; the
 * write only succeeds if `revision` is still current (otherwise nothing is overwritten and the
 * page is refreshed to show the newer data).
 */
export async function updateCharacterBasicsAction(
  id: unknown,
  revision: unknown,
  input: unknown,
): Promise<ActionResult<{ revision: number }>> {
  const target = z.object({ id: idSchema, revision: revisionSchema }).safeParse({ id, revision });
  if (!target.success) return invalidInput(target.error);
  const parsed = basicInfoSchema.safeParse(input);
  if (!parsed.success) return invalidInput(parsed.error);

  const repository = createCharacterRepository(getDb());
  try {
    const current = await repository.getById(target.data.id);
    // Saving would store the current version and drop the review list the user has not seen.
    if ((current.pendingMigration?.review.length ?? 0) > 0) {
      return fail({
        code: "migration_review_required",
        message: messages.errors.migration_review_required,
      });
    }
    const facts = applyBasicInfo(current.facts, parsed.data);
    const saved = await repository.update(target.data.id, facts, target.data.revision);
    refresh();
    return ok({ revision: saved.revision });
  } catch (error) {
    if (isRepositoryError(error, "revision_conflict")) refresh();
    return failFromError(error);
  }
}

export async function setFavoriteAction(id: unknown, isFavorite: unknown): Promise<ActionResult> {
  const parsed = z.object({ id: idSchema, isFavorite: z.boolean() }).safeParse({ id, isFavorite });
  if (!parsed.success) return invalidInput(parsed.error);
  try {
    await createCharacterRepository(getDb()).setFavorite(parsed.data.id, parsed.data.isFavorite);
    refresh();
    return ok();
  } catch (error) {
    return failFromError(error);
  }
}

/**
 * Soft-delete a character (references to it in other characters become unlinked).
 * `refreshPage` is false when the caller navigates away (the detail page of the deleted
 * character would otherwise re-render as "not found").
 */
export async function deleteCharacterAction(
  id: unknown,
  revision: unknown,
  refreshPage: unknown = true,
): Promise<ActionResult> {
  const parsed = z
    .object({ id: idSchema, revision: revisionSchema, refreshPage: z.boolean() })
    .safeParse({ id, revision, refreshPage });
  if (!parsed.success) return invalidInput(parsed.error);
  try {
    await createCharacterRepository(getDb()).softDelete(parsed.data.id, parsed.data.revision);
    if (parsed.data.refreshPage) refresh();
    return ok();
  } catch (error) {
    if (isRepositoryError(error, "revision_conflict")) refresh();
    return failFromError(error);
  }
}
