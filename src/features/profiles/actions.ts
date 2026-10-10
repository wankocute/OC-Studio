"use server";

import { refresh } from "next/cache";
import { z } from "zod";

import { getDb } from "@/db";
import { messages } from "@/i18n";
import { type ActionResult, fail, failFromError, invalidInput, ok } from "@/lib/action-result";

import type { RichTextDocument } from "./domain";
import { snapshotForSection } from "./fact-sources";
import { loadFactSources } from "./server/fact-source-loader";
import { createProfileRepository } from "./server/profile-repository";
import { toApprovedView, toRevisionSummaryView, toStructureView } from "./server/profile-views";
import type { ApprovedView, ProfileStructureView, RevisionSummaryView } from "./view";

const id = z.uuid();
const revision = z.int().min(1);
const title = z.string().max(1_000);
const groups = z.array(z.string().max(200)).max(100);

/** Source groups must exist for this character (built-in, library or its own groups). */
async function unknownSourceGroups(
  characterId: string,
  sourceGroups: readonly string[],
): Promise<boolean> {
  const { sources } = await loadFactSources(getDb(), characterId);
  const known = new Set(sources.groups.map((group) => group.id));
  return sourceGroups.some((group) => !known.has(group));
}

const invalidSourceGroups = () =>
  fail({
    code: "invalid_input",
    message: messages.errors.validation_failed,
    fieldErrors: { sourceGroups: messages.profiles.sourcesTitle },
  });

/** Start the character's primary profile with the template's sections. */
export async function startProfileAction(characterId: unknown): Promise<ActionResult> {
  const parsed = id.safeParse(characterId);
  if (!parsed.success) return invalidInput(parsed.error);
  try {
    await createProfileRepository(getDb()).createPrimary(parsed.data);
    refresh();
    return ok();
  } catch (error) {
    return failFromError(error);
  }
}

const addSchema = z.object({
  characterId: id,
  profileId: id,
  revision,
  title,
  sourceGroups: groups,
});

export async function addSectionAction(
  input: unknown,
): Promise<ActionResult<ProfileStructureView & { sectionId: string }>> {
  const parsed = addSchema.safeParse(input);
  if (!parsed.success) return invalidInput(parsed.error);
  const { characterId, profileId, revision: expected, ...section } = parsed.data;
  try {
    if (await unknownSourceGroups(characterId, section.sourceGroups)) return invalidSourceGroups();
    const result = await createProfileRepository(getDb()).addSection(profileId, expected, section);
    return ok({ ...toStructureView(result), sectionId: result.sectionId });
  } catch (error) {
    return failFromError(error);
  }
}

const updateSchema = z.object({
  characterId: id,
  profileId: id,
  revision,
  sectionId: id,
  update: z.strictObject({
    title: title.nullable().optional(),
    isHidden: z.boolean().optional(),
    sourceGroups: groups.optional(),
  }),
});

export async function updateSectionAction(
  input: unknown,
): Promise<ActionResult<ProfileStructureView>> {
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) return invalidInput(parsed.error);
  const { characterId, profileId, revision: expected, sectionId, update } = parsed.data;
  try {
    if (update.sourceGroups && (await unknownSourceGroups(characterId, update.sourceGroups))) {
      return invalidSourceGroups();
    }
    const result = await createProfileRepository(getDb()).updateSection(
      profileId,
      expected,
      sectionId,
      update,
    );
    return ok(toStructureView(result));
  } catch (error) {
    return failFromError(error);
  }
}

const reorderSchema = z.object({ profileId: id, revision, order: z.array(id).max(100) });

export async function reorderSectionsAction(
  input: unknown,
): Promise<ActionResult<ProfileStructureView>> {
  const parsed = reorderSchema.safeParse(input);
  if (!parsed.success) return invalidInput(parsed.error);
  try {
    const result = await createProfileRepository(getDb()).reorderSections(
      parsed.data.profileId,
      parsed.data.revision,
      parsed.data.order,
    );
    return ok(toStructureView(result));
  } catch (error) {
    return failFromError(error);
  }
}

const draftSchema = z.object({
  sectionId: id,
  draftRevision: revision,
  replaceNewer: z.boolean(),
});

export type DraftSavedView = { draftRevision: number; savedAt: string };

/**
 * Autosave of one section draft. Content is validated by the repository (restricted Tiptap JSON).
 * No `refresh()`: the workspace keeps its own state.
 */
export async function saveSectionDraftAction(
  sectionId: unknown,
  draftRevision: unknown,
  content: unknown,
  replaceNewer: unknown = false,
): Promise<ActionResult<DraftSavedView>> {
  const parsed = draftSchema.safeParse({ sectionId, draftRevision, replaceNewer });
  if (!parsed.success) return invalidInput(parsed.error);
  try {
    const saved = await createProfileRepository(getDb()).saveDraft(
      parsed.data.sectionId,
      content,
      parsed.data.draftRevision,
      { replaceNewer: parsed.data.replaceNewer },
    );
    return ok({
      draftRevision: saved.draftRevision,
      savedAt: saved.draftUpdatedAt.toISOString(),
    });
  } catch (error) {
    return failFromError(error);
  }
}

export type StoredDraftView = {
  draft: RichTextDocument | null;
  draftRevision: number;
  savedAt: string | null;
};

/** The stored draft of a section as it is now, to resolve a conflict. */
export async function loadSectionDraftAction(
  sectionId: unknown,
): Promise<ActionResult<StoredDraftView>> {
  const parsed = id.safeParse(sectionId);
  if (!parsed.success) return invalidInput(parsed.error);
  try {
    const section = await createProfileRepository(getDb()).getSection(parsed.data);
    return ok({
      draft: section.draft,
      draftRevision: section.draftRevision,
      savedAt: section.draftUpdatedAt?.toISOString() ?? null,
    });
  } catch (error) {
    return failFromError(error);
  }
}

/**
 * Approve the saved draft. The fact snapshot (fingerprints only) of the section's source groups
 * is recorded so the page can tell later when the approved text may be outdated.
 * `approved: null` = the draft is already the approved content (nothing recorded).
 */
export async function approveSectionAction(
  sectionId: unknown,
  draftRevision: unknown,
): Promise<ActionResult<{ approved: ApprovedView | null }>> {
  const parsed = z
    .object({ sectionId: id, draftRevision: revision })
    .safeParse({ sectionId, draftRevision });
  if (!parsed.success) return invalidInput(parsed.error);
  const db = getDb();
  const repository = createProfileRepository(db);
  try {
    const context = await repository.getSectionContext(parsed.data.sectionId);
    const { sources } = await loadFactSources(db, context.characterId);
    const result = await repository.approve(
      parsed.data.sectionId,
      parsed.data.draftRevision,
      snapshotForSection(sources, context.sourceGroups),
    );
    return ok({ approved: result.changed ? toApprovedView(result.approved, sources) : null });
  } catch (error) {
    return failFromError(error);
  }
}

export async function listSectionHistoryAction(
  sectionId: unknown,
): Promise<ActionResult<RevisionSummaryView[]>> {
  const parsed = id.safeParse(sectionId);
  if (!parsed.success) return invalidInput(parsed.error);
  try {
    const history = await createProfileRepository(getDb()).listHistory(parsed.data);
    return ok(history.map(toRevisionSummaryView));
  } catch (error) {
    return failFromError(error);
  }
}

export async function getRevisionAction(
  sectionId: unknown,
  revisionId: unknown,
): Promise<ActionResult<{ content: RichTextDocument }>> {
  const parsed = z.object({ sectionId: id, revisionId: id }).safeParse({ sectionId, revisionId });
  if (!parsed.success) return invalidInput(parsed.error);
  try {
    const found = await createProfileRepository(getDb()).getRevision(
      parsed.data.sectionId,
      parsed.data.revisionId,
    );
    return ok({ content: found.content });
  } catch (error) {
    return failFromError(error);
  }
}

export type RestoredView = { content: RichTextDocument; draftRevision: number; savedAt: string };

/** `restored: null` = the draft already equals that revision (nothing changed). */
export async function restoreRevisionAction(
  sectionId: unknown,
  revisionId: unknown,
  draftRevision: unknown,
): Promise<ActionResult<{ restored: RestoredView | null }>> {
  const parsed = z
    .object({ sectionId: id, revisionId: id, draftRevision: revision })
    .safeParse({ sectionId, revisionId, draftRevision });
  if (!parsed.success) return invalidInput(parsed.error);
  try {
    const result = await createProfileRepository(getDb()).restore(
      parsed.data.sectionId,
      parsed.data.revisionId,
      parsed.data.draftRevision,
    );
    if (!result.changed) return ok({ restored: null });
    return ok({
      restored: {
        content: result.content,
        draftRevision: result.draftRevision,
        savedAt: result.draftUpdatedAt.toISOString(),
      },
    });
  } catch (error) {
    return failFromError(error);
  }
}
