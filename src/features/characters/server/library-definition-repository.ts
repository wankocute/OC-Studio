import "server-only";

import { asc, eq, inArray, sql } from "drizzle-orm";

import type { Database, DbExecutor } from "@/db";
import { guard, RepositoryError } from "@/db/repository-errors";
import {
  characters,
  type DefinitionStatus,
  libraryFieldDefinitions,
  libraryFieldGroups,
} from "@/db/schema";
import {
  type CustomGroupDefinition,
  findBreakingChanges,
  type LibraryDefinitions,
  type LibraryFieldDefinition,
  parseLibraryDefinitions,
} from "@/features/characters/domain";

import { issuesOf } from "./validation";

export type LibraryFieldRecord = {
  definition: LibraryFieldDefinition;
  status: DefinitionStatus;
  createdAt: Date;
  updatedAt: Date;
  deprecatedAt: Date | null;
};

/** `Omit` applied to each member of a union, so `kind`-specific properties survive. */
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

/** A library field definition as supplied by callers: `version` is managed by the repository. */
export type LibraryFieldInput = DistributiveOmit<LibraryFieldDefinition, "version">;
/** The editable part of a definition: the key is permanent and the version is managed. */
export type LibraryFieldUpdate = DistributiveOmit<LibraryFieldDefinition, "version" | "key">;

type FieldRow = typeof libraryFieldDefinitions.$inferSelect;
type GroupRow = typeof libraryFieldGroups.$inferSelect;

function withoutKeys(value: object, keys: readonly string[]): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).filter(([key]) => !keys.includes(key)));
}

function toDefinition(row: FieldRow): LibraryFieldDefinition {
  return { ...row.definition, key: row.key, version: row.version } as LibraryFieldDefinition;
}

function toGroup(row: GroupRow): CustomGroupDefinition {
  return row.parent === null
    ? { id: row.id, label: row.label }
    : { id: row.id, label: row.label, parent: row.parent };
}

function toRecord(row: FieldRow): LibraryFieldRecord {
  return {
    definition: toDefinition(row),
    status: row.status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deprecatedAt: row.deprecatedAt,
  };
}

/**
 * Load every library definition — active *and* deprecated, because characters that already use
 * a deprecated field must keep validating. `lockKeys` takes a share lock on those definitions so
 * they cannot be deleted while the caller's transaction is writing values for them.
 */
export async function loadLibraryDefinitions(
  executor: DbExecutor,
  options: { lockKeys?: readonly string[] } = {},
): Promise<{ library: LibraryDefinitions; deprecatedKeys: Set<string> }> {
  if (options.lockKeys && options.lockKeys.length > 0) {
    await executor
      .select({ key: libraryFieldDefinitions.key })
      .from(libraryFieldDefinitions)
      .where(inArray(libraryFieldDefinitions.key, [...options.lockKeys]))
      .for("share");
  }
  const groups = await executor
    .select()
    .from(libraryFieldGroups)
    .orderBy(asc(libraryFieldGroups.position), asc(libraryFieldGroups.id));
  const fields = await executor
    .select()
    .from(libraryFieldDefinitions)
    .orderBy(asc(libraryFieldDefinitions.position), asc(libraryFieldDefinitions.key));
  return {
    library: { groups: groups.map(toGroup), fields: fields.map(toDefinition) },
    deprecatedKeys: new Set(
      fields.filter((row) => row.status === "deprecated").map((row) => row.key),
    ),
  };
}

function assertValidLibrary(library: LibraryDefinitions): void {
  const result = parseLibraryDefinitions(library);
  if (!result.success) {
    throw new RepositoryError("validation_failed", { issues: issuesOf(result.error) });
  }
}

export function createLibraryDefinitionRepository(db: Database) {
  return {
    /** Definitions to pass as `DefinitionContext.library`. */
    load: () => guard(async () => (await loadLibraryDefinitions(db)).library),

    listFields: () =>
      guard(async () => {
        const rows = await db
          .select()
          .from(libraryFieldDefinitions)
          .orderBy(asc(libraryFieldDefinitions.position), asc(libraryFieldDefinitions.key));
        return rows.map(toRecord);
      }),

    createGroup: (group: CustomGroupDefinition, position = 0) =>
      guard(() =>
        db.transaction(async (tx) => {
          const { library } = await loadLibraryDefinitions(tx);
          assertValidLibrary({ ...library, groups: [...library.groups, group] });
          await tx.insert(libraryFieldGroups).values({
            id: group.id,
            label: group.label,
            parent: group.parent ?? null,
            position,
          });
          return group;
        }),
      ),

    /** Create a definition at version 1. A key that ever existed (even deprecated) is a duplicate. */
    createField: (input: LibraryFieldInput, position = 0) =>
      guard(() =>
        db.transaction(async (tx) => {
          const definition = { ...input, version: 1 } as LibraryFieldDefinition;
          const { library } = await loadLibraryDefinitions(tx);
          assertValidLibrary({ ...library, fields: [...library.fields, definition] });
          const [row] = await tx
            .insert(libraryFieldDefinitions)
            .values({
              key: definition.key,
              version: 1,
              definition: withoutKeys(definition, ["key", "version"]),
              position,
            })
            .returning();
          return toRecord(row!);
        }),
      ),

    /**
     * Edit a definition in place. Only compatible edits are accepted (`findBreakingChanges`), so
     * every value stored under the previous version stays valid; `version` increases by one.
     * `expectedVersion` guards against concurrent edits.
     */
    updateField: (key: string, next: LibraryFieldUpdate, expectedVersion: number) =>
      guard(() =>
        db.transaction(async (tx) => {
          const [row] = await tx
            .select()
            .from(libraryFieldDefinitions)
            .where(eq(libraryFieldDefinitions.key, key))
            .for("update");
          if (!row) throw new RepositoryError("not_found", { entity: "library_field", id: key });
          if (row.version !== expectedVersion) {
            throw new RepositoryError("revision_conflict", {
              id: key,
              expectedRevision: expectedVersion,
              actualRevision: row.version,
            });
          }

          const previous = toDefinition(row);
          const definition = { ...next, key, version: row.version + 1 } as LibraryFieldDefinition;
          const changes = findBreakingChanges(previous, definition);
          if (changes.length > 0) {
            throw new RepositoryError("definition_breaking_change", { key, changes });
          }

          const { library } = await loadLibraryDefinitions(tx);
          assertValidLibrary({
            ...library,
            fields: library.fields.map((field) => (field.key === key ? definition : field)),
          });

          const [updated] = await tx
            .update(libraryFieldDefinitions)
            .set({
              definition: withoutKeys(definition, ["key", "version"]),
              version: definition.version,
              updatedAt: sql`now()`,
            })
            .where(eq(libraryFieldDefinitions.key, key))
            .returning();
          return toRecord(updated!);
        }),
      ),

    /**
     * Retire a definition: hidden from new input, still resolved for characters that use it.
     * Idempotent. The key is never freed for reuse.
     */
    deprecateField: (key: string) =>
      guard(async () => {
        const [row] = await db
          .update(libraryFieldDefinitions)
          .set({
            status: "deprecated",
            deprecatedAt: sql`coalesce(${libraryFieldDefinitions.deprecatedAt}, now())`,
            updatedAt: sql`now()`,
          })
          .where(eq(libraryFieldDefinitions.key, key))
          .returning();
        if (!row) throw new RepositoryError("not_found", { entity: "library_field", id: key });
        return toRecord(row);
      }),

    /**
     * Delete a definition that no character (including soft-deleted ones) has ever stored a fact
     * for. Deprecated definitions are kept forever so their keys are never reused.
     */
    deleteUnusedField: (key: string) =>
      guard(() =>
        db.transaction(async (tx) => {
          const [row] = await tx
            .select()
            .from(libraryFieldDefinitions)
            .where(eq(libraryFieldDefinitions.key, key))
            .for("update");
          if (!row) throw new RepositoryError("not_found", { entity: "library_field", id: key });
          if (row.status === "deprecated") {
            throw new RepositoryError("definition_deprecated", { keys: [key] });
          }
          const [used] = await tx
            .select({ id: characters.id })
            .from(characters)
            .where(sql`${characters.facts} -> 'values' ? ${key}`)
            .limit(1);
          if (used) throw new RepositoryError("definition_in_use", { key });
          await tx.delete(libraryFieldDefinitions).where(eq(libraryFieldDefinitions.key, key));
        }),
      ),
  };
}

export type LibraryDefinitionRepository = ReturnType<typeof createLibraryDefinitionRepository>;
