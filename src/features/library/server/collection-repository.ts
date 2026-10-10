import "server-only";

import { and, asc, count, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";

import type { Database } from "@/db";
import { guard, RepositoryError } from "@/db/repository-errors";
import { characterCollections, characters, collections, LIBRARY_LIMITS } from "@/db/schema";

import { assertActiveCharacter } from "./active-character";

export type Collection = typeof collections.$inferSelect;

const collectionInputSchema = z.object({
  name: z
    .string()
    .transform((name) => name.normalize("NFC").trim())
    .pipe(
      z.string().min(1, "Tên bộ sưu tập không được để trống.").max(LIBRARY_LIMITS.collectionName),
    ),
  description: z
    .string()
    .transform((text) => text.normalize("NFC").trim() || undefined)
    .pipe(z.string().max(LIBRARY_LIMITS.collectionDescription).optional())
    .optional(),
});

export type CollectionInput = z.input<typeof collectionInputSchema>;

function parseCollection(input: CollectionInput) {
  const result = collectionInputSchema.safeParse(input);
  if (!result.success) {
    throw new RepositoryError("validation_failed", {
      issues: result.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
    });
  }
  return { name: result.data.name, description: result.data.description ?? null };
}

export type CollectionSummary = Collection & { characterCount: number };

export function createCollectionRepository(db: Database) {
  return {
    /** Names are unique ignoring case; collections are flat (no nesting). */
    create: (input: CollectionInput) =>
      guard(async () => {
        const [row] = await db.insert(collections).values(parseCollection(input)).returning();
        return row!;
      }),

    list: () => guard(() => db.select().from(collections).orderBy(asc(collections.name))),

    get: (id: string) =>
      guard(async () => {
        const [row] = await db.select().from(collections).where(eq(collections.id, id));
        if (!row) throw new RepositoryError("not_found", { entity: "collection", id });
        return row;
      }),

    /** Collections with the number of non-deleted characters in each. */
    listWithCounts: () =>
      guard((): Promise<CollectionSummary[]> =>
        db
          .select({
            id: collections.id,
            name: collections.name,
            description: collections.description,
            createdAt: collections.createdAt,
            updatedAt: collections.updatedAt,
            characterCount: sql<number>`count(${characters.id})::int`,
          })
          .from(collections)
          .leftJoin(characterCollections, eq(characterCollections.collectionId, collections.id))
          .leftJoin(
            characters,
            and(eq(characters.id, characterCollections.characterId), isNull(characters.deletedAt)),
          )
          .groupBy(collections.id)
          .orderBy(asc(collections.name)),
      ),

    count: () =>
      guard(async () => {
        const [row] = await db.select({ value: count() }).from(collections);
        return row?.value ?? 0;
      }),

    /** Rename / re-describe. Names stay unique ignoring case. */
    update: (id: string, input: CollectionInput) =>
      guard(async () => {
        const [row] = await db
          .update(collections)
          .set({ ...parseCollection(input), updatedAt: sql`now()` })
          .where(eq(collections.id, id))
          .returning();
        if (!row) throw new RepositoryError("not_found", { entity: "collection", id });
        return row;
      }),

    /** Delete a collection. Memberships go with it (FK cascade); characters are untouched. */
    delete: (id: string) =>
      guard(async () => {
        const [row] = await db
          .delete(collections)
          .where(eq(collections.id, id))
          .returning({ id: collections.id });
        if (!row) throw new RepositoryError("not_found", { entity: "collection", id });
      }),

    listForCharacter: (characterId: string) =>
      guard(() =>
        db
          .select({ id: collections.id, name: collections.name })
          .from(characterCollections)
          .innerJoin(collections, eq(collections.id, characterCollections.collectionId))
          .where(eq(characterCollections.characterId, characterId))
          .orderBy(asc(collections.name)),
      ),

    /** Idempotent; an existing membership keeps its position. */
    addCharacter: (collectionId: string, characterId: string, position = 0) =>
      guard(() =>
        db.transaction(async (tx) => {
          await assertActiveCharacter(tx, characterId);
          await tx
            .insert(characterCollections)
            .values({ collectionId, characterId, position })
            .onConflictDoNothing();
        }),
      ),

    removeCharacter: (collectionId: string, characterId: string) =>
      guard(async () => {
        await db
          .delete(characterCollections)
          .where(
            and(
              eq(characterCollections.collectionId, collectionId),
              eq(characterCollections.characterId, characterId),
            ),
          );
      }),

    listCharacters: (collectionId: string) =>
      guard(() =>
        db
          .select({
            id: characters.id,
            displayName: characters.displayName,
            position: characterCollections.position,
            deletedAt: characters.deletedAt,
          })
          .from(characterCollections)
          .innerJoin(characters, eq(characters.id, characterCollections.characterId))
          .where(eq(characterCollections.collectionId, collectionId))
          .orderBy(asc(characterCollections.position), asc(characters.displayName)),
      ),
  };
}

export type CollectionRepository = ReturnType<typeof createCollectionRepository>;
