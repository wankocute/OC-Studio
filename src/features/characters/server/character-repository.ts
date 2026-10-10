import "server-only";

import { and, desc, eq, inArray, isNull, ne, sql } from "drizzle-orm";

import type { Database, DbExecutor, Transaction } from "@/db";
import { guard, RepositoryError } from "@/db/repository-errors";
import { characterReferences, characters } from "@/db/schema";
import {
  type CharacterFacts,
  collectLinkedReferences,
  detachDeletedCharacter,
  type LibraryDefinitions,
  type MigrationReviewItem,
  migrateCharacterFacts,
  NAMESPACES,
  parseCharacterFacts,
} from "@/features/characters/domain";

import { loadLibraryDefinitions } from "./library-definition-repository";
import { issuesOf } from "./validation";

export type CharacterRecord = {
  id: string;
  /** Full domain sheet: `displayName` and `schemaVersion` come from their columns. */
  facts: CharacterFacts;
  revision: number;
  isFavorite: boolean;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  /**
   * Present when the row was stored with an older schema: `facts` were migrated in memory
   * (nothing was written). The next successful update stores the current version.
   */
  pendingMigration?: { fromVersion: number; review: MigrationReviewItem[] };
};

export type CharacterSummary = {
  id: string;
  displayName: string;
  isFavorite: boolean;
  revision: number;
  updatedAt: Date;
  deletedAt: Date | null;
};

export type DetachedSource = { characterId: string; refs: string[] };

type CharacterRow = typeof characters.$inferSelect;

// ---------------------------------------------------------------------------
// Persistence ⇄ domain
// ---------------------------------------------------------------------------

/**
 * Split a sheet into its columns. `displayName` and `schemaVersion` live only in their columns,
 * so the JSONB body can never disagree with them (also enforced by a CHECK constraint).
 */
export function toStoredColumns(facts: CharacterFacts) {
  const { displayName, schemaVersion, ...body } = facts;
  return { displayName, schemaVersion, facts: body as Record<string, unknown> };
}

/** Rebuild the stored sheet exactly as written: body plus the two column-owned properties. */
function storedSheet(row: Pick<CharacterRow, "displayName" | "schemaVersion" | "facts">) {
  return { ...row.facts, schemaVersion: row.schemaVersion, displayName: row.displayName };
}

/** Read a row into a current-version sheet, migrating in memory when needed. Never writes. */
function readFacts(
  row: CharacterRow,
  library: LibraryDefinitions,
): { facts: CharacterFacts; pendingMigration?: CharacterRecord["pendingMigration"] } {
  const result = migrateCharacterFacts(storedSheet(row), { library });
  switch (result.status) {
    case "current":
      return { facts: result.facts };
    case "migrated":
      return {
        facts: result.facts,
        pendingMigration: { fromVersion: result.fromVersion, review: result.review },
      };
    case "rejected":
      if (result.reason === "invalid_result" && result.issues) {
        throw new RepositoryError("validation_failed", {
          issues: result.issues.map((issue) => ({
            path: issue.path.join("."),
            message: issue.message,
          })),
        });
      }
      throw new RepositoryError("unsupported_schema", {
        id: row.id,
        schemaVersion: row.schemaVersion,
        reason: result.reason,
      });
  }
}

function toRecord(row: CharacterRow, library: LibraryDefinitions): CharacterRecord {
  const { facts, pendingMigration } = readFacts(row, library);
  const record: CharacterRecord = {
    id: row.id,
    facts,
    revision: row.revision,
    isFavorite: row.isFavorite,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt,
  };
  if (pendingMigration) record.pendingMigration = pendingMigration;
  return record;
}

function libraryKeysOf(facts: { values: object }): string[] {
  return Object.keys(facts.values).filter((key) => key.startsWith(NAMESPACES.libraryField));
}

function assertValid(facts: CharacterFacts, library: LibraryDefinitions): void {
  const result = parseCharacterFacts(facts, { library });
  if (!result.success) {
    throw new RepositoryError("validation_failed", { issues: issuesOf(result.error) });
  }
}

/** Deprecated library fields stay valid where already used, but cannot be newly used. */
function assertNoNewDeprecatedFields(
  facts: CharacterFacts,
  deprecatedKeys: ReadonlySet<string>,
  previouslyUsed: ReadonlySet<string>,
): void {
  const keys = libraryKeysOf(facts).filter(
    (key) => deprecatedKeys.has(key) && !previouslyUsed.has(key),
  );
  if (keys.length > 0) throw new RepositoryError("definition_deprecated", { keys });
}

// ---------------------------------------------------------------------------
// Reference index
// ---------------------------------------------------------------------------

type ReferenceRow = typeof characterReferences.$inferInsert;

function referenceRows(
  sourceCharacterId: string,
  facts: CharacterFacts,
  library: LibraryDefinitions,
): ReferenceRow[] {
  const unique = new Map<string, ReferenceRow>();
  for (const { characterId, at } of collectLinkedReferences(facts, { library })) {
    unique.set(`${at}\u0000${characterId}`, {
      sourceCharacterId,
      factRef: at,
      targetCharacterId: characterId,
    });
  }
  return [...unique.values()];
}

/**
 * Share-lock every referenced character and require it to exist and not be soft-deleted.
 * The share lock makes a concurrent soft delete of a target wait for this transaction (and then
 * see its new references), so no dangling reference can be committed.
 */
async function lockReferenceTargets(tx: Transaction, rows: readonly ReferenceRow[]): Promise<void> {
  const ids = [...new Set(rows.map((row) => row.targetCharacterId))];
  if (ids.length === 0) return;
  const found = await tx
    .select({ id: characters.id })
    .from(characters)
    .where(and(inArray(characters.id, ids), isNull(characters.deletedAt)))
    .for("share");
  const existing = new Set(found.map((row) => row.id));
  const missing = ids.filter((id) => !existing.has(id));
  if (missing.length > 0) {
    throw new RepositoryError("reference_target_missing", { characterIds: missing });
  }
}

async function replaceReferenceIndex(
  tx: DbExecutor,
  sourceCharacterId: string,
  rows: readonly ReferenceRow[],
): Promise<void> {
  await tx
    .delete(characterReferences)
    .where(eq(characterReferences.sourceCharacterId, sourceCharacterId));
  if (rows.length > 0) await tx.insert(characterReferences).values([...rows]);
}

async function revisionConflictOrMissing(
  tx: DbExecutor,
  id: string,
  expectedRevision: number,
): Promise<RepositoryError> {
  const [row] = await tx
    .select({ revision: characters.revision, deletedAt: characters.deletedAt })
    .from(characters)
    .where(eq(characters.id, id));
  if (!row || row.deletedAt) return new RepositoryError("not_found", { entity: "character", id });
  return new RepositoryError("revision_conflict", {
    id,
    expectedRevision,
    actualRevision: row.revision,
  });
}

// ---------------------------------------------------------------------------
// Repository
// ---------------------------------------------------------------------------

export function createCharacterRepository(db: Database) {
  return {
    /**
     * Insert a new character. The sheet must be valid for the current schema (with the library
     * definitions it uses); linked references must point to existing, non-deleted characters.
     * Lock order: library definitions → own row → reference targets (see docs/database-design.md).
     */
    create: (facts: CharacterFacts, options: { id?: string; isFavorite?: boolean } = {}) =>
      guard(() =>
        db.transaction(async (tx) => {
          const { library, deprecatedKeys } = await loadLibraryDefinitions(tx, {
            lockKeys: libraryKeysOf(facts),
          });
          assertValid(facts, library);
          assertNoNewDeprecatedFields(facts, deprecatedKeys, new Set());

          const [row] = await tx
            .insert(characters)
            .values({
              ...(options.id ? { id: options.id } : {}),
              ...toStoredColumns(facts),
              isFavorite: options.isFavorite ?? false,
            })
            .returning();

          const references = referenceRows(row!.id, facts, library);
          await lockReferenceTargets(tx, references);
          await replaceReferenceIndex(tx, row!.id, references);
          return toRecord(row!, library);
        }),
      ),

    getById: (id: string, options: { includeDeleted?: boolean } = {}) =>
      guard(async () => {
        const [row] = await db.select().from(characters).where(eq(characters.id, id));
        if (!row || (row.deletedAt && !options.includeDeleted)) {
          throw new RepositoryError("not_found", { entity: "character", id });
        }
        const { library } = await loadLibraryDefinitions(db);
        return toRecord(row, library);
      }),

    /** Library listing: metadata only, most recently updated first. */
    list: (options: { includeDeleted?: boolean } = {}) =>
      guard((): Promise<CharacterSummary[]> =>
        db
          .select({
            id: characters.id,
            displayName: characters.displayName,
            isFavorite: characters.isFavorite,
            revision: characters.revision,
            updatedAt: characters.updatedAt,
            deletedAt: characters.deletedAt,
          })
          .from(characters)
          .where(options.includeDeleted ? undefined : isNull(characters.deletedAt))
          .orderBy(desc(characters.updatedAt), characters.id),
      ),

    /**
     * Replace a character's sheet if `expectedRevision` is still current; the revision then
     * increases by one. A stale revision fails with `revision_conflict` — nothing is overwritten.
     * Lock order: library definitions → reference targets → own row.
     */
    update: (id: string, facts: CharacterFacts, expectedRevision: number) =>
      guard(() =>
        db.transaction(async (tx) => {
          const [current] = await tx
            .select({
              revision: characters.revision,
              deletedAt: characters.deletedAt,
              facts: characters.facts,
            })
            .from(characters)
            .where(eq(characters.id, id));
          if (!current || current.deletedAt) {
            throw new RepositoryError("not_found", { entity: "character", id });
          }
          if (current.revision !== expectedRevision) {
            throw new RepositoryError("revision_conflict", {
              id,
              expectedRevision,
              actualRevision: current.revision,
            });
          }

          const { library, deprecatedKeys } = await loadLibraryDefinitions(tx, {
            lockKeys: libraryKeysOf(facts),
          });
          assertValid(facts, library);
          const previous = new Set(libraryKeysOf(current.facts as { values: object }));
          assertNoNewDeprecatedFields(facts, deprecatedKeys, previous);

          const references = referenceRows(id, facts, library);
          await lockReferenceTargets(tx, references);

          const [row] = await tx
            .update(characters)
            .set({
              ...toStoredColumns(facts),
              revision: sql`${characters.revision} + 1`,
              updatedAt: sql`now()`,
            })
            .where(
              and(
                eq(characters.id, id),
                eq(characters.revision, expectedRevision),
                isNull(characters.deletedAt),
              ),
            )
            .returning();
          if (!row) throw await revisionConflictOrMissing(tx, id, expectedRevision);

          await replaceReferenceIndex(tx, id, references);
          return toRecord(row, library);
        }),
      ),

    /** Favourite is library metadata, not a fact: it does not change `revision`. */
    setFavorite: (id: string, isFavorite: boolean) =>
      guard(async () => {
        const [row] = await db
          .update(characters)
          .set({ isFavorite })
          .where(and(eq(characters.id, id), isNull(characters.deletedAt)))
          .returning({ id: characters.id });
        if (!row) throw new RepositoryError("not_found", { entity: "character", id });
      }),

    /**
     * Soft-delete a character in one transaction:
     * 1. lock the target row (FOR UPDATE) and check its revision;
     * 2. find every character referencing it via the index and lock them (FOR UPDATE, by id);
     * 3. turn each reference into `unlinked` with `detachDeletedCharacter` (name snapshot,
     *    relationship facts kept), validate, write facts + index, bump their revision;
     * 4. mark the target deleted.
     * Any failure rolls everything back. References are never re-linked automatically.
     */
    softDelete: (id: string, expectedRevision: number, at: Date = new Date()) =>
      guard(() =>
        db.transaction(async (tx) => {
          const [target] = await tx
            .select()
            .from(characters)
            .where(eq(characters.id, id))
            .for("update");
          if (!target || target.deletedAt) {
            throw new RepositoryError("not_found", { entity: "character", id });
          }
          if (target.revision !== expectedRevision) {
            throw new RepositoryError("revision_conflict", {
              id,
              expectedRevision,
              actualRevision: target.revision,
            });
          }

          const { library } = await loadLibraryDefinitions(tx);
          const deleted = { characterId: id, displayName: target.displayName };
          const detachedAt = at.toISOString();

          const sourceIds = (
            await tx
              .selectDistinct({ id: characterReferences.sourceCharacterId })
              .from(characterReferences)
              .where(
                and(
                  eq(characterReferences.targetCharacterId, id),
                  ne(characterReferences.sourceCharacterId, id),
                ),
              )
          ).map((row) => row.id);

          const sources =
            sourceIds.length === 0
              ? []
              : await tx
                  .select()
                  .from(characters)
                  .where(inArray(characters.id, sourceIds))
                  .orderBy(characters.id)
                  .for("update");

          const detached: DetachedSource[] = [];
          for (const source of sources) {
            const { facts } = readFacts(source, library);
            const result = detachDeletedCharacter(facts, deleted, detachedAt, { library });
            if (result.detached.length === 0) continue;
            assertValid(result.facts, library);
            await tx
              .update(characters)
              .set({
                ...toStoredColumns(result.facts),
                revision: sql`${characters.revision} + 1`,
                updatedAt: sql`now()`,
              })
              .where(eq(characters.id, source.id));
            await replaceReferenceIndex(
              tx,
              source.id,
              referenceRows(source.id, result.facts, library),
            );
            detached.push({ characterId: source.id, refs: result.detached });
          }

          // A character may reference itself; those references are detached too.
          const own = detachDeletedCharacter(
            readFacts(target, library).facts,
            deleted,
            detachedAt,
            {
              library,
            },
          );
          if (own.detached.length > 0) assertValid(own.facts, library);

          const [row] = await tx
            .update(characters)
            .set({
              ...(own.detached.length > 0 ? toStoredColumns(own.facts) : {}),
              deletedAt: at,
              revision: sql`${characters.revision} + 1`,
              updatedAt: sql`now()`,
            })
            .where(eq(characters.id, id))
            .returning({ revision: characters.revision });
          await replaceReferenceIndex(tx, id, referenceRows(id, own.facts, library));

          return { revision: row!.revision, detached };
        }),
      ),
  };
}

export type CharacterRepository = ReturnType<typeof createCharacterRepository>;
