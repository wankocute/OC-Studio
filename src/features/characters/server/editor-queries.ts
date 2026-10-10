import "server-only";

import { and, asc, eq, isNull, like, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import type { DbExecutor } from "@/db";
import { guard } from "@/db/repository-errors";
import { characterReferences, characters, libraryFieldDefinitions } from "@/db/schema";

/** Id + name of every active character, for reference pickers (never the fact sheets). */
export function listCharacterNames(db: DbExecutor) {
  return guard(() =>
    db
      .select({ id: characters.id, displayName: characters.displayName })
      .from(characters)
      .where(isNull(characters.deletedAt))
      .orderBy(asc(characters.displayName), asc(characters.id)),
  );
}

/**
 * Active characters whose relationships link to `characterId` (read from the reference index).
 * Used to suggest — never create — reverse relationships (Q4).
 */
export function listRelationshipSourcesTo(db: DbExecutor, characterId: string) {
  const source = alias(characters, "source");
  return guard(async () => {
    const rows = await db
      .selectDistinct({ id: characterReferences.sourceCharacterId })
      .from(characterReferences)
      .innerJoin(source, eq(source.id, characterReferences.sourceCharacterId))
      .where(
        and(
          eq(characterReferences.targetCharacterId, characterId),
          like(characterReferences.factRef, "relationships.entries[%"),
          isNull(source.deletedAt),
        ),
      );
    return rows.map((row) => row.id);
  });
}

/** Library field key → number of active characters storing a fact for it. */
export function countLibraryFieldUsage(db: DbExecutor) {
  return guard(async () => {
    const rows = await db
      .select({
        key: libraryFieldDefinitions.key,
        count: sql<number>`count(${characters.id})::int`,
      })
      .from(libraryFieldDefinitions)
      .leftJoin(
        characters,
        and(
          sql`${characters.facts} -> 'values' ? ${libraryFieldDefinitions.key}`,
          isNull(characters.deletedAt),
        ),
      )
      .groupBy(libraryFieldDefinitions.key);
    return Object.fromEntries(rows.map((row) => [row.key, row.count]));
  });
}
