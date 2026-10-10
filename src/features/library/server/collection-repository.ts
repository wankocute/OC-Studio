import "server-only";

import { and, asc, eq } from "drizzle-orm";
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

export function createCollectionRepository(db: Database) {
  return {
    /** Names are unique ignoring case; collections are flat (no nesting). */
    create: (input: CollectionInput) =>
      guard(async () => {
        const result = collectionInputSchema.safeParse(input);
        if (!result.success) {
          throw new RepositoryError("validation_failed", {
            issues: result.error.issues.map((issue) => ({
              path: issue.path.join("."),
              message: issue.message,
            })),
          });
        }
        const [row] = await db
          .insert(collections)
          .values({ name: result.data.name, description: result.data.description ?? null })
          .returning();
        return row!;
      }),

    list: () => guard(() => db.select().from(collections).orderBy(asc(collections.name))),

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
