import "server-only";

import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";

import type { Database } from "@/db";
import { guard, RepositoryError } from "@/db/repository-errors";
import { characterTags, LIBRARY_LIMITS, tags } from "@/db/schema";

import { assertActiveCharacter } from "./active-character";

export type Tag = typeof tags.$inferSelect;

/** Tag names are trimmed and NFC-normalised before storage; uniqueness is case-insensitive. */
const tagNameSchema = z
  .string()
  .transform((name) => name.normalize("NFC").trim())
  .pipe(z.string().min(1, "Tên thẻ không được để trống.").max(LIBRARY_LIMITS.tagName));

function parseName(input: string): string {
  const result = tagNameSchema.safeParse(input);
  if (!result.success) {
    throw new RepositoryError("validation_failed", {
      issues: result.error.issues.map((issue) => ({ path: "name", message: issue.message })),
    });
  }
  return result.data;
}

export function createTagRepository(db: Database) {
  return {
    /** Fails with `duplicate` when a tag with the same name (ignoring case) exists. */
    create: (name: string) =>
      guard(async () => {
        const [row] = await db
          .insert(tags)
          .values({ name: parseName(name) })
          .returning();
        return row!;
      }),

    list: () => guard(() => db.select().from(tags).orderBy(asc(tags.name))),

    /** Idempotent. */
    attach: (characterId: string, tagId: string) =>
      guard(() =>
        db.transaction(async (tx) => {
          await assertActiveCharacter(tx, characterId);
          await tx.insert(characterTags).values({ characterId, tagId }).onConflictDoNothing();
        }),
      ),

    detach: (characterId: string, tagId: string) =>
      guard(async () => {
        await db
          .delete(characterTags)
          .where(and(eq(characterTags.characterId, characterId), eq(characterTags.tagId, tagId)));
      }),

    listForCharacter: (characterId: string) =>
      guard(() =>
        db
          .select({ id: tags.id, name: tags.name, createdAt: tags.createdAt })
          .from(characterTags)
          .innerJoin(tags, eq(tags.id, characterTags.tagId))
          .where(eq(characterTags.characterId, characterId))
          .orderBy(asc(tags.name)),
      ),
  };
}

export type TagRepository = ReturnType<typeof createTagRepository>;
