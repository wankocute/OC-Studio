import "server-only";

import { randomUUID } from "node:crypto";

import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import type { Database, DbExecutor, Transaction } from "@/db";
import { guard, RepositoryError } from "@/db/repository-errors";
import { characters, contentRevisions, profiles, profileSections } from "@/db/schema";
import type { FactSnapshot } from "@/features/characters/domain";
import { issuesOf } from "@/features/characters/server/validation";
import { isAiSnapshot } from "../ai/facts";
import {
  CHECKPOINT_INTERVAL_MS,
  contentHash,
  CUSTOM_SECTION_PREFIX,
  DEFAULT_PROFILE_TEMPLATE,
  documentExcerpt,
  documentText,
  isBuiltinSectionKey,
  isDocumentEmpty,
  normalizeSectionTitle,
  parseRichTextDocument,
  PROFILE_LIMITS,
  type RevisionKind,
  type RichTextDocument,
  sameContent,
  sectionTitleSchema,
  sourceGroupsSchema,
} from "@/features/profiles/domain";

// ---------------------------------------------------------------------------
// Records
// ---------------------------------------------------------------------------

export type SectionStructure = {
  id: string;
  key: string;
  /** User title; `null` = default label of a built-in section. */
  title: string | null;
  position: number;
  isHidden: boolean;
  sourceGroups: string[];
};

export type ApprovedContent = {
  revisionId: string;
  content: RichTextDocument;
  hash: string;
  approvedAt: Date;
  factSnapshot: FactSnapshot | null;
};

export type ProfileSectionRecord = SectionStructure & {
  draft: RichTextDocument | null;
  draftRevision: number;
  draftUpdatedAt: Date | null;
  approved: ApprovedContent | null;
};

export type ProfileStructure = { id: string; revision: number; sections: SectionStructure[] };

export type ProfileRecord = {
  id: string;
  characterId: string;
  revision: number;
  createdAt: Date;
  updatedAt: Date;
  sections: ProfileSectionRecord[];
};

export type RevisionSummary = {
  id: string;
  kind: RevisionKind;
  createdAt: Date;
  hash: string;
  excerpt: string;
  textLength: number;
  restoredFromId: string | null;
};

export type RevisionRecord = RevisionSummary & {
  content: RichTextDocument;
  factSnapshot: FactSnapshot | null;
};

export type DraftSaved = { draftRevision: number; draftUpdatedAt: Date };

export type SectionUpdate = {
  /** `null` resets a built-in section to its default label. */
  title?: string | null;
  isHidden?: boolean;
  sourceGroups?: string[];
};

type SectionRow = typeof profileSections.$inferSelect;
type RevisionRow = typeof contentRevisions.$inferSelect;

/** History entries shown per section (most recent first). */
const HISTORY_LIMIT = 100;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function validationError(message: string, path = ""): RepositoryError {
  return new RepositoryError("validation_failed", { issues: [{ path, message }] });
}

function parseContent(input: unknown): RichTextDocument {
  const result = parseRichTextDocument(input);
  if (!result.success) {
    throw new RepositoryError("validation_failed", { issues: issuesOf(result.error) });
  }
  return result.data;
}

/** Stored JSON is trusted only after validation; corrupt rows surface as errors, not as data. */
function storedContent(value: unknown): RichTextDocument {
  return parseContent(value);
}

function toStructure(row: SectionRow): SectionStructure {
  return {
    id: row.id,
    key: row.key,
    title: row.title,
    position: row.position,
    isHidden: row.isHidden,
    sourceGroups: row.sourceGroups,
  };
}

function toApproved(row: RevisionRow | null): ApprovedContent | null {
  if (!row) return null;
  return {
    revisionId: row.id,
    content: storedContent(row.content),
    hash: row.contentHash,
    approvedAt: row.createdAt,
    factSnapshot: (row.factSnapshot as FactSnapshot | null) ?? null,
  };
}

function toSection(row: SectionRow, approved: RevisionRow | null): ProfileSectionRecord {
  return {
    ...toStructure(row),
    draft: row.draftContent === null ? null : storedContent(row.draftContent),
    draftRevision: row.draftRevision,
    draftUpdatedAt: row.draftUpdatedAt,
    approved: toApproved(approved),
  };
}

function toSummary(row: RevisionRow): RevisionSummary {
  const content = storedContent(row.content);
  return {
    id: row.id,
    kind: row.kind as RevisionKind,
    createdAt: row.createdAt,
    hash: row.contentHash,
    excerpt: documentExcerpt(content),
    textLength: documentText(content).length,
    restoredFromId: row.restoredFromId,
  };
}

function newSectionKey(): string {
  return `${CUSTOM_SECTION_PREFIX}${randomUUID().replaceAll("-", "").slice(0, 20)}`;
}

function parseTitle(input: string): string {
  const result = sectionTitleSchema.safeParse(normalizeSectionTitle(input));
  if (!result.success) throw validationError(result.error.issues[0]!.message, "title");
  return result.data;
}

function parseSourceGroups(input: readonly string[]): string[] {
  const result = sourceGroupsSchema.safeParse(input);
  if (!result.success) throw validationError(result.error.issues[0]!.message, "sourceGroups");
  return result.data;
}

async function assertActiveCharacter(executor: DbExecutor, characterId: string): Promise<void> {
  const [row] = await executor
    .select({ id: characters.id })
    .from(characters)
    .where(and(eq(characters.id, characterId), isNull(characters.deletedAt)))
    .for("share");
  if (!row) throw new RepositoryError("not_found", { entity: "character", id: characterId });
}

/** Lock a profile for a structure change; `revision_conflict` if someone changed it first. */
async function lockProfile(tx: Transaction, profileId: string, expectedRevision: number) {
  const [row] = await tx
    .select({ id: profiles.id, revision: profiles.revision })
    .from(profiles)
    .innerJoin(characters, eq(characters.id, profiles.characterId))
    .where(and(eq(profiles.id, profileId), isNull(characters.deletedAt)))
    .for("update", { of: profiles });
  if (!row) throw new RepositoryError("not_found", { entity: "profile", id: profileId });
  if (row.revision !== expectedRevision) {
    throw new RepositoryError("revision_conflict", {
      id: profileId,
      expectedRevision,
      actualRevision: row.revision,
    });
  }
}

async function bumpProfile(tx: Transaction, profileId: string): Promise<ProfileStructure> {
  const [profile] = await tx
    .update(profiles)
    .set({ revision: sql`${profiles.revision} + 1`, updatedAt: sql`now()` })
    .where(eq(profiles.id, profileId))
    .returning({ id: profiles.id, revision: profiles.revision });
  const rows = await tx
    .select()
    .from(profileSections)
    .where(eq(profileSections.profileId, profileId))
    .orderBy(asc(profileSections.position), asc(profileSections.createdAt));
  return { id: profile!.id, revision: profile!.revision, sections: rows.map(toStructure) };
}

/** Lock a section (of a non-deleted character) for a content change. */
async function lockSection(tx: Transaction, sectionId: string): Promise<SectionRow> {
  const [row] = await tx
    .select({ section: profileSections })
    .from(profileSections)
    .innerJoin(profiles, eq(profiles.id, profileSections.profileId))
    .innerJoin(characters, eq(characters.id, profiles.characterId))
    .where(and(eq(profileSections.id, sectionId), isNull(characters.deletedAt)))
    .for("update", { of: profileSections });
  if (!row) throw new RepositoryError("not_found", { entity: "profile_section", id: sectionId });
  return row.section;
}

function assertDraftRevision(section: SectionRow, expected: number): void {
  if (section.draftRevision !== expected) {
    throw new RepositoryError("revision_conflict", {
      id: section.id,
      expectedRevision: expected,
      actualRevision: section.draftRevision,
    });
  }
}

async function latestRevision(tx: DbExecutor, sectionId: string): Promise<RevisionRow | null> {
  const [row] = await tx
    .select()
    .from(contentRevisions)
    .where(eq(contentRevisions.sectionId, sectionId))
    .orderBy(desc(contentRevisions.createdAt), desc(contentRevisions.id))
    .limit(1);
  return row ?? null;
}

async function insertRevision(
  tx: DbExecutor,
  values: {
    sectionId: string;
    kind: RevisionKind;
    content: RichTextDocument;
    createdAt: Date;
    restoredFromId?: string;
    factSnapshot?: FactSnapshot;
  },
): Promise<RevisionRow> {
  const [row] = await tx
    .insert(contentRevisions)
    .values({
      sectionId: values.sectionId,
      kind: values.kind,
      content: values.content as unknown as Record<string, unknown>,
      contentHash: contentHash(values.content),
      restoredFromId: values.restoredFromId ?? null,
      factSnapshot: (values.factSnapshot as unknown as Record<string, unknown>) ?? null,
      createdAt: values.createdAt,
    })
    .returning();
  return row!;
}

/**
 * Record the stored draft in the history before it is replaced — unless it is empty or already
 * the most recent history entry (no duplicate revisions for unchanged content).
 */
async function recordDraft(
  tx: DbExecutor,
  section: SectionRow,
  kind: RevisionKind,
  at: Date,
): Promise<void> {
  if (section.draftContent === null) return;
  const draft = storedContent(section.draftContent);
  if (isDocumentEmpty(draft)) return;
  const latest = await latestRevision(tx, section.id);
  if (latest?.contentHash === contentHash(draft)) return;
  await insertRevision(tx, {
    sectionId: section.id,
    kind,
    content: draft,
    createdAt: at,
    factSnapshot: latest?.factSnapshot ? (latest.factSnapshot as FactSnapshot) : undefined,
  });
}

async function writeDraft(
  tx: DbExecutor,
  section: SectionRow,
  content: RichTextDocument,
  at: Date,
): Promise<DraftSaved> {
  const [row] = await tx
    .update(profileSections)
    .set({
      draftContent: content as unknown as Record<string, unknown>,
      draftRevision: section.draftRevision + 1,
      draftUpdatedAt: at,
      updatedAt: at,
    })
    .where(eq(profileSections.id, section.id))
    .returning({
      draftRevision: profileSections.draftRevision,
      draftUpdatedAt: profileSections.draftUpdatedAt,
    });
  return { draftRevision: row!.draftRevision, draftUpdatedAt: row!.draftUpdatedAt! };
}

const approvedRevisions = alias(contentRevisions, "approved_revision");

async function loadSections(
  executor: DbExecutor,
  where: ReturnType<typeof eq>,
): Promise<ProfileSectionRecord[]> {
  const rows = await executor
    .select({ section: profileSections, approved: approvedRevisions })
    .from(profileSections)
    .leftJoin(approvedRevisions, eq(approvedRevisions.id, profileSections.approvedRevisionId))
    .where(where)
    .orderBy(asc(profileSections.position), asc(profileSections.createdAt));
  return rows.map((row) => toSection(row.section, row.approved));
}

// ---------------------------------------------------------------------------
// Repository
// ---------------------------------------------------------------------------

export function createProfileRepository(db: Database) {
  const getPrimary = (characterId: string) =>
    guard(async (): Promise<ProfileRecord | null> => {
      await assertActiveCharacter(db, characterId);
      const [profile] = await db
        .select()
        .from(profiles)
        .where(and(eq(profiles.characterId, characterId), eq(profiles.isPrimary, true)));
      if (!profile) return null;
      return {
        id: profile.id,
        characterId: profile.characterId,
        revision: profile.revision,
        createdAt: profile.createdAt,
        updatedAt: profile.updatedAt,
        sections: await loadSections(db, eq(profileSections.profileId, profile.id)),
      };
    });

  return {
    /** The character's primary profile, or `null` if none was started yet. */
    getPrimary,

    /**
     * Start the primary profile with the built-in template's sections (empty drafts). Idempotent:
     * if it already exists (e.g. two tabs clicked at once), the existing profile is returned.
     */
    createPrimary: (characterId: string) =>
      guard(async (): Promise<ProfileRecord> => {
        await db.transaction(async (tx) => {
          await assertActiveCharacter(tx, characterId);
          const [profile] = await tx
            .insert(profiles)
            .values({ characterId, isPrimary: true })
            .onConflictDoNothing({
              target: profiles.characterId,
              where: sql`${profiles.isPrimary}`,
            })
            .returning({ id: profiles.id });
          if (!profile) return;
          await tx.insert(profileSections).values(
            DEFAULT_PROFILE_TEMPLATE.sections.map((section, position) => ({
              profileId: profile.id,
              key: section.key,
              position,
              sourceGroups: [...section.sourceGroups],
            })),
          );
        });
        return (await getPrimary(characterId))!;
      }),

    /** Lightweight summary for the character page. */
    getPrimarySummary: (characterId: string) =>
      guard(async () => {
        const rows = await db
          .select({
            sections: sql<number>`count(${profileSections.id}) filter (where not ${profileSections.isHidden})::int`,
            approved: sql<number>`count(${profileSections.approvedRevisionId}) filter (where not ${profileSections.isHidden})::int`,
          })
          .from(profiles)
          .leftJoin(profileSections, eq(profileSections.profileId, profiles.id))
          .where(and(eq(profiles.characterId, characterId), eq(profiles.isPrimary, true)))
          .groupBy(profiles.id);
        return rows[0] ?? null;
      }),

    addSection: (
      profileId: string,
      expectedRevision: number,
      input: { title: string; sourceGroups?: string[] },
    ) =>
      guard(() =>
        db.transaction(async (tx): Promise<ProfileStructure & { sectionId: string }> => {
          await lockProfile(tx, profileId, expectedRevision);
          const title = parseTitle(input.title);
          const sourceGroups = parseSourceGroups(input.sourceGroups ?? []);
          const [stats] = await tx
            .select({
              count: sql<number>`count(*)::int`,
              maxPosition: sql<number>`coalesce(max(${profileSections.position}), -1)::int`,
            })
            .from(profileSections)
            .where(eq(profileSections.profileId, profileId));
          if (stats!.count >= PROFILE_LIMITS.sections) {
            throw validationError(`Hồ sơ có tối đa ${PROFILE_LIMITS.sections} mục.`);
          }
          const [section] = await tx
            .insert(profileSections)
            .values({
              profileId,
              key: newSectionKey(),
              title,
              position: stats!.maxPosition + 1,
              sourceGroups,
            })
            .returning({ id: profileSections.id });
          return { ...(await bumpProfile(tx, profileId)), sectionId: section!.id };
        }),
      ),

    updateSection: (
      profileId: string,
      expectedRevision: number,
      sectionId: string,
      update: SectionUpdate,
    ) =>
      guard(() =>
        db.transaction(async (tx): Promise<ProfileStructure> => {
          await lockProfile(tx, profileId, expectedRevision);
          const [section] = await tx
            .select({ key: profileSections.key })
            .from(profileSections)
            .where(
              and(eq(profileSections.id, sectionId), eq(profileSections.profileId, profileId)),
            );
          if (!section) {
            throw new RepositoryError("not_found", { entity: "profile_section", id: sectionId });
          }
          const set: Partial<typeof profileSections.$inferInsert> = {};
          if (update.title !== undefined) {
            if (update.title === null && !isBuiltinSectionKey(section.key)) {
              throw validationError("Tên mục không được để trống.", "title");
            }
            set.title = update.title === null ? null : parseTitle(update.title);
          }
          if (update.isHidden !== undefined) set.isHidden = update.isHidden;
          if (update.sourceGroups !== undefined) {
            set.sourceGroups = parseSourceGroups(update.sourceGroups);
          }
          if (Object.keys(set).length > 0) {
            await tx
              .update(profileSections)
              .set({ ...set, updatedAt: sql`now()` })
              .where(eq(profileSections.id, sectionId));
          }
          return bumpProfile(tx, profileId);
        }),
      ),

    /** `orderedIds` must list every section of the profile exactly once. */
    reorderSections: (profileId: string, expectedRevision: number, orderedIds: string[]) =>
      guard(() =>
        db.transaction(async (tx): Promise<ProfileStructure> => {
          await lockProfile(tx, profileId, expectedRevision);
          const rows = await tx
            .select({ id: profileSections.id })
            .from(profileSections)
            .where(eq(profileSections.profileId, profileId));
          const existing = new Set(rows.map((row) => row.id));
          if (
            orderedIds.length !== existing.size ||
            new Set(orderedIds).size !== orderedIds.length ||
            orderedIds.some((id) => !existing.has(id))
          ) {
            throw validationError("Thứ tự mục không khớp với hồ sơ hiện tại.", "order");
          }
          for (const [position, id] of orderedIds.entries()) {
            await tx
              .update(profileSections)
              .set({ position, updatedAt: sql`now()` })
              .where(eq(profileSections.id, id));
          }
          return bumpProfile(tx, profileId);
        }),
      ),

    /** One section with its draft and approved content (for conflict resolution). */
    getSection: (sectionId: string) =>
      guard(async () => {
        const [section] = await loadSections(db, eq(profileSections.id, sectionId));
        if (!section) {
          throw new RepositoryError("not_found", { entity: "profile_section", id: sectionId });
        }
        return section;
      }),

    /** Owner character and source groups of a section (for building a fact snapshot). */
    getSectionContext: (sectionId: string) =>
      guard(async () => {
        const [row] = await db
          .select({
            characterId: profiles.characterId,
            sourceGroups: profileSections.sourceGroups,
          })
          .from(profileSections)
          .innerJoin(profiles, eq(profiles.id, profileSections.profileId))
          .where(eq(profileSections.id, sectionId));
        if (!row) {
          throw new RepositoryError("not_found", { entity: "profile_section", id: sectionId });
        }
        return row;
      }),

    /**
     * Save a section draft if `expectedDraftRevision` is still current; otherwise
     * `revision_conflict` and nothing is written. Never touches the approved content.
     *
     * History: when the previous draft was left alone for `CHECKPOINT_INTERVAL_MS` (or the last
     * history entry is that old), it is recorded as an `autosave` revision first — milestones,
     * not keystrokes. `replaceNewer` is the explicit "keep my version" of a conflict: the newer
     * stored draft is recorded as a `conflict` revision before being replaced, so it stays
     * recoverable.
     */
    saveDraft: (
      sectionId: string,
      input: unknown,
      expectedDraftRevision: number,
      options: { now?: Date; replaceNewer?: boolean } = {},
    ) =>
      guard(() =>
        db.transaction(async (tx): Promise<DraftSaved> => {
          const content = parseContent(input);
          const section = await lockSection(tx, sectionId);
          assertDraftRevision(section, expectedDraftRevision);
          const now = options.now ?? new Date();

          if (options.replaceNewer) {
            await recordDraft(tx, section, "conflict", now);
          } else if (section.draftUpdatedAt) {
            const latest = await latestRevision(tx, section.id);
            const idle = now.getTime() - section.draftUpdatedAt.getTime();
            const sinceHistory = latest ? now.getTime() - latest.createdAt.getTime() : 0;
            if (idle >= CHECKPOINT_INTERVAL_MS || sinceHistory >= CHECKPOINT_INTERVAL_MS) {
              await recordDraft(tx, section, "autosave", now);
            }
          }
          return writeDraft(tx, section, content, now);
        }),
      ),

    /**
     * Approve the stored draft as the official content. `expectedDraftRevision` guarantees the
     * approved content is exactly the saved draft the user saw. Approving content identical to
     * the current approved version records nothing (`changed: false`).
     */
    approve: (
      sectionId: string,
      expectedDraftRevision: number,
      factSnapshot: FactSnapshot,
      options: { now?: Date } = {},
    ) =>
      guard(() =>
        db.transaction(async (tx) => {
          const section = await lockSection(tx, sectionId);
          assertDraftRevision(section, expectedDraftRevision);
          const draft = section.draftContent === null ? null : storedContent(section.draftContent);
          if (!draft || isDocumentEmpty(draft)) {
            throw validationError("Không thể duyệt nội dung trống.", "draft");
          }
          if (section.approvedRevisionId) {
            const [current] = await tx
              .select({ hash: contentRevisions.contentHash })
              .from(contentRevisions)
              .where(eq(contentRevisions.id, section.approvedRevisionId));
            if (current?.hash === contentHash(draft)) return { changed: false as const };
          }
          const now = options.now ?? new Date();
          const latest = await latestRevision(tx, sectionId);
          const provenance = latest?.factSnapshot as FactSnapshot | null;
          const revision = await insertRevision(tx, {
            sectionId,
            kind: "approval",
            content: draft,
            createdAt: now,
            factSnapshot: provenance && isAiSnapshot(provenance) ? provenance : factSnapshot,
          });
          await tx
            .update(profileSections)
            .set({ approvedRevisionId: revision.id, updatedAt: now })
            .where(eq(profileSections.id, sectionId));
          return { changed: true as const, approved: toApproved(revision)! };
        }),
      ),

    applyAiDraft: (
      sectionId: string,
      expectedDraftRevision: number,
      input: unknown,
      snapshot: FactSnapshot,
    ) =>
      guard(() =>
        db.transaction(async (tx) => {
          const content = parseContent(input);
          const section = await lockSection(tx, sectionId);
          assertDraftRevision(section, expectedDraftRevision);
          const now = new Date();
          await recordDraft(tx, section, "before_restore", now);
          await insertRevision(tx, {
            sectionId,
            kind: "restore",
            content,
            factSnapshot: snapshot,
            createdAt: new Date(now.getTime() + 1),
          });
          return writeDraft(tx, section, content, new Date(now.getTime() + 1));
        }),
      ),

    listHistory: (sectionId: string) =>
      guard(async (): Promise<RevisionSummary[]> => {
        const rows = await db
          .select()
          .from(contentRevisions)
          .where(eq(contentRevisions.sectionId, sectionId))
          .orderBy(desc(contentRevisions.createdAt), desc(contentRevisions.id))
          .limit(HISTORY_LIMIT);
        return rows.map(toSummary);
      }),

    getRevision: (sectionId: string, revisionId: string) =>
      guard(async (): Promise<RevisionRecord> => {
        const [row] = await db
          .select()
          .from(contentRevisions)
          .where(
            and(eq(contentRevisions.id, revisionId), eq(contentRevisions.sectionId, sectionId)),
          );
        if (!row) throw new RepositoryError("not_found", { entity: "revision", id: revisionId });
        return {
          ...toSummary(row),
          content: storedContent(row.content),
          factSnapshot: (row.factSnapshot as FactSnapshot | null) ?? null,
        };
      }),

    /**
     * Make an older revision the draft again. The replaced draft is kept in the history
     * (`before_restore`) and the approved content is never changed. Restoring content equal to
     * the current draft is a no-op.
     */
    restore: (
      sectionId: string,
      revisionId: string,
      expectedDraftRevision: number,
      options: { now?: Date } = {},
    ) =>
      guard(() =>
        db.transaction(async (tx) => {
          const section = await lockSection(tx, sectionId);
          assertDraftRevision(section, expectedDraftRevision);
          const [source] = await tx
            .select()
            .from(contentRevisions)
            .where(
              and(eq(contentRevisions.id, revisionId), eq(contentRevisions.sectionId, sectionId)),
            );
          if (!source) {
            throw new RepositoryError("not_found", { entity: "revision", id: revisionId });
          }
          const content = storedContent(source.content);
          const draft = section.draftContent === null ? null : storedContent(section.draftContent);
          if (sameContent(draft, content)) return { changed: false as const };

          const now = options.now ?? new Date();
          await recordDraft(tx, section, "before_restore", now);
          await insertRevision(tx, {
            sectionId,
            kind: "restore",
            content,
            // Strictly after the snapshot of the replaced draft, so the history order is stable.
            createdAt: new Date(now.getTime() + 1),
            restoredFromId: source.id,
            factSnapshot: source.factSnapshot ? (source.factSnapshot as FactSnapshot) : undefined,
          });
          const saved = await writeDraft(tx, section, content, new Date(now.getTime() + 1));
          return { changed: true as const, content, ...saved };
        }),
      ),
  };
}

export type ProfileRepository = ReturnType<typeof createProfileRepository>;
