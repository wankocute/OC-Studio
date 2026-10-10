"use server";

import { refresh } from "next/cache";
import { z } from "zod";

import { getDb } from "@/db";
import { messages } from "@/i18n";
import { type ActionResult, failFromError, invalidInput, ok } from "@/lib/action-result";

import {
  type CustomGroupDefinition,
  LIMITS,
  type LibraryFieldDefinition,
  libraryFieldKeySchema,
} from "./domain";
import { newLibraryGroupId } from "./editor/ids";
import {
  createLibraryDefinitionRepository,
  type LibraryFieldInput,
  type LibraryFieldUpdate,
} from "./server/library-definition-repository";

/** The repository validates definitions in full (with the rest of the library). */
const definitionShape = z.looseObject({ kind: z.string(), label: z.string(), group: z.string() });
const versionSchema = z.int().min(1);

function withoutVersion(input: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(input).filter(([key]) => key !== "version"));
}

/**
 * Create a library-scoped field definition (version 1) at the end of the list.
 * `refreshPage` is false in the Fact Editor, which keeps its own state.
 */
export async function createLibraryFieldAction(
  input: unknown,
  refreshPage: unknown = true,
): Promise<ActionResult<LibraryFieldDefinition>> {
  const parsed = definitionShape.extend({ key: libraryFieldKeySchema }).safeParse(input);
  if (!parsed.success) return invalidInput(parsed.error);
  const repository = createLibraryDefinitionRepository(getDb());
  try {
    const position = (await repository.listFields()).length;
    const record = await repository.createField(
      withoutVersion(parsed.data) as LibraryFieldInput,
      position,
    );
    if (refreshPage === true) refresh();
    return ok(record.definition);
  } catch (error) {
    return failFromError(error);
  }
}

/** Compatible edits only (`findBreakingChanges`); `expectedVersion` guards concurrent edits. */
export async function updateLibraryFieldAction(
  key: unknown,
  expectedVersion: unknown,
  input: unknown,
): Promise<ActionResult<LibraryFieldDefinition>> {
  const target = z
    .object({ key: libraryFieldKeySchema, expectedVersion: versionSchema })
    .safeParse({ key, expectedVersion });
  if (!target.success) return invalidInput(target.error);
  const parsed = definitionShape.safeParse(input);
  if (!parsed.success) return invalidInput(parsed.error);
  const update = Object.fromEntries(
    Object.entries(parsed.data).filter(([name]) => name !== "key" && name !== "version"),
  ) as LibraryFieldUpdate;
  try {
    const record = await createLibraryDefinitionRepository(getDb()).updateField(
      target.data.key,
      update,
      target.data.expectedVersion,
    );
    refresh();
    return ok(record.definition);
  } catch (error) {
    return failFromError(error);
  }
}

export async function deprecateLibraryFieldAction(key: unknown): Promise<ActionResult> {
  const parsed = libraryFieldKeySchema.safeParse(key);
  if (!parsed.success) return invalidInput(parsed.error);
  try {
    await createLibraryDefinitionRepository(getDb()).deprecateField(parsed.data);
    refresh();
    return ok();
  } catch (error) {
    return failFromError(error);
  }
}

/** Only definitions that no character ever stored a value for can be deleted. */
export async function deleteLibraryFieldAction(key: unknown): Promise<ActionResult> {
  const parsed = libraryFieldKeySchema.safeParse(key);
  if (!parsed.success) return invalidInput(parsed.error);
  try {
    await createLibraryDefinitionRepository(getDb()).deleteUnusedField(parsed.data);
    refresh();
    return ok();
  } catch (error) {
    return failFromError(error);
  }
}

const groupInputSchema = z.object({
  label: z
    .string()
    .transform((value) => value.normalize("NFC").trim())
    .pipe(
      z
        .string()
        .min(1, messages.editor.validation.required)
        .max(LIMITS.shortText, messages.characters.validation.tooLong(LIMITS.shortText)),
    ),
  parent: z.string().optional(),
});

export async function createLibraryGroupAction(
  input: unknown,
): Promise<ActionResult<CustomGroupDefinition>> {
  const parsed = groupInputSchema.safeParse(input);
  if (!parsed.success) return invalidInput(parsed.error);
  const repository = createLibraryDefinitionRepository(getDb());
  try {
    const { groups } = await repository.load();
    const group: CustomGroupDefinition = {
      id: newLibraryGroupId(),
      label: parsed.data.label,
      ...(parsed.data.parent ? { parent: parsed.data.parent } : {}),
    };
    await repository.createGroup(group, groups.length);
    refresh();
    return ok(group);
  } catch (error) {
    return failFromError(error);
  }
}
