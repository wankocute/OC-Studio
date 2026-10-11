"use server";

import { refresh } from "next/cache";
import { z } from "zod";

import { getDb } from "@/db";
import { rejectUnauthenticatedAction } from "@/features/auth/server/session";
import { type ActionResult, failFromError, invalidInput, ok } from "@/lib/action-result";

import { createCollectionRepository } from "./server/collection-repository";
import { createTagRepository } from "./server/tag-repository";

const idSchema = z.uuid();
const textSchema = z.string().max(2_000);

// --- tags ------------------------------------------------------------------------------

/** Attach an existing tag, or create one by name (reusing an existing tag with that name). */
export async function addTagAction(
  characterId: unknown,
  tag: unknown,
): Promise<ActionResult<{ id: string; name: string }>> {
  const denied = await rejectUnauthenticatedAction();
  if (denied) return denied;
  const parsed = z
    .object({
      characterId: idSchema,
      tag: z.union([z.object({ id: idSchema }), z.object({ name: textSchema })]),
    })
    .safeParse({ characterId, tag });
  if (!parsed.success) return invalidInput(parsed.error);

  const repository = createTagRepository(getDb());
  try {
    const { tag } = parsed.data;
    const target =
      "id" in tag
        ? await repository.get(tag.id)
        : ((await repository.findByName(tag.name)) ?? (await repository.create(tag.name)));
    await repository.attach(parsed.data.characterId, target.id);
    refresh();
    return ok({ id: target.id, name: target.name });
  } catch (error) {
    return failFromError(error);
  }
}

export async function removeTagAction(characterId: unknown, tagId: unknown): Promise<ActionResult> {
  const denied = await rejectUnauthenticatedAction();
  if (denied) return denied;
  const parsed = z
    .object({ characterId: idSchema, tagId: idSchema })
    .safeParse({ characterId, tagId });
  if (!parsed.success) return invalidInput(parsed.error);
  try {
    await createTagRepository(getDb()).detach(parsed.data.characterId, parsed.data.tagId);
    refresh();
    return ok();
  } catch (error) {
    return failFromError(error);
  }
}

// --- collections ------------------------------------------------------------------------

const collectionInput = z.object({
  name: textSchema,
  description: textSchema.optional(),
});

export async function createCollectionAction(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const denied = await rejectUnauthenticatedAction();
  if (denied) return denied;
  const parsed = collectionInput.safeParse(input);
  if (!parsed.success) return invalidInput(parsed.error);
  try {
    const row = await createCollectionRepository(getDb()).create(parsed.data);
    refresh();
    return ok({ id: row.id });
  } catch (error) {
    return failFromError(error);
  }
}

export async function updateCollectionAction(id: unknown, input: unknown): Promise<ActionResult> {
  const denied = await rejectUnauthenticatedAction();
  if (denied) return denied;
  const parsed = z.object({ id: idSchema, input: collectionInput }).safeParse({ id, input });
  if (!parsed.success) return invalidInput(parsed.error);
  try {
    await createCollectionRepository(getDb()).update(parsed.data.id, parsed.data.input);
    refresh();
    return ok();
  } catch (error) {
    return failFromError(error);
  }
}

/** Delete a collection; its characters stay in the library. */
export async function deleteCollectionAction(
  id: unknown,
  refreshPage: unknown = true,
): Promise<ActionResult> {
  const denied = await rejectUnauthenticatedAction();
  if (denied) return denied;
  const parsed = z
    .object({ id: idSchema, refreshPage: z.boolean() })
    .safeParse({ id, refreshPage });
  if (!parsed.success) return invalidInput(parsed.error);
  try {
    await createCollectionRepository(getDb()).delete(parsed.data.id);
    if (parsed.data.refreshPage) refresh();
    return ok();
  } catch (error) {
    return failFromError(error);
  }
}

export async function addToCollectionAction(
  collectionId: unknown,
  characterId: unknown,
): Promise<ActionResult> {
  const denied = await rejectUnauthenticatedAction();
  if (denied) return denied;
  const parsed = z
    .object({ collectionId: idSchema, characterId: idSchema })
    .safeParse({ collectionId, characterId });
  if (!parsed.success) return invalidInput(parsed.error);
  try {
    await createCollectionRepository(getDb()).addCharacter(
      parsed.data.collectionId,
      parsed.data.characterId,
    );
    refresh();
    return ok();
  } catch (error) {
    return failFromError(error);
  }
}

export async function removeFromCollectionAction(
  collectionId: unknown,
  characterId: unknown,
): Promise<ActionResult> {
  const denied = await rejectUnauthenticatedAction();
  if (denied) return denied;
  const parsed = z
    .object({ collectionId: idSchema, characterId: idSchema })
    .safeParse({ collectionId, characterId });
  if (!parsed.success) return invalidInput(parsed.error);
  try {
    await createCollectionRepository(getDb()).removeCharacter(
      parsed.data.collectionId,
      parsed.data.characterId,
    );
    refresh();
    return ok();
  } catch (error) {
    return failFromError(error);
  }
}
