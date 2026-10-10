import "server-only";

import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";

import type { Database } from "@/db";
import { guard, RepositoryError } from "@/db/repository-errors";
import {
  characterMedia,
  LIBRARY_LIMITS,
  mediaAssets,
  MEDIA_ROLES,
  type MediaRole,
} from "@/db/schema";

import { assertActiveCharacter } from "./active-character";

export type MediaAsset = typeof mediaAssets.$inferSelect;

/** Metadata of a file already written to storage by a (future) storage adapter. */
const mediaAssetInputSchema = z
  .strictObject({
    storageKey: z.string().trim().min(1).max(LIBRARY_LIMITS.storageKey),
    originalFilename: z.string().min(1).max(LIBRARY_LIMITS.filename).optional(),
    mimeType: z.string().regex(/^image\/[a-z0-9.+-]+$/, "Chỉ chấp nhận tệp ảnh."),
    byteSize: z.int().positive(),
    width: z.int().positive().optional(),
    height: z.int().positive().optional(),
  })
  .refine((input) => (input.width === undefined) === (input.height === undefined), {
    message: "Cần cả chiều rộng và chiều cao, hoặc không có cả hai.",
    path: ["width"],
  });

export type MediaAssetInput = z.input<typeof mediaAssetInputSchema>;

export function createMediaRepository(db: Database) {
  return {
    createAsset: (input: MediaAssetInput) =>
      guard(async () => {
        const result = mediaAssetInputSchema.safeParse(input);
        if (!result.success) {
          throw new RepositoryError("validation_failed", {
            issues: result.error.issues.map((issue) => ({
              path: issue.path.join("."),
              message: issue.message,
            })),
          });
        }
        const [row] = await db.insert(mediaAssets).values(result.data).returning();
        return row!;
      }),

    /** Attach an asset to a character. At most one avatar per character (`duplicate` otherwise). */
    attach: (input: { characterId: string; mediaId: string; role: MediaRole; position?: number }) =>
      guard(() =>
        db.transaction(async (tx) => {
          if (!MEDIA_ROLES.includes(input.role)) {
            throw new RepositoryError("validation_failed", {
              issues: [{ path: "role", message: "Vai trò ảnh không hợp lệ." }],
            });
          }
          await assertActiveCharacter(tx, input.characterId);
          await tx.insert(characterMedia).values({
            characterId: input.characterId,
            mediaId: input.mediaId,
            role: input.role,
            position: input.position ?? 0,
          });
        }),
      ),

    /** Make one attached image the character's primary image, clearing the previous one. */
    setPrimary: (characterId: string, mediaId: string) =>
      guard(() =>
        db.transaction(async (tx) => {
          const [link] = await tx
            .select({ mediaId: characterMedia.mediaId })
            .from(characterMedia)
            .where(
              and(eq(characterMedia.characterId, characterId), eq(characterMedia.mediaId, mediaId)),
            )
            .for("update");
          if (!link)
            throw new RepositoryError("not_found", { entity: "character_media", id: mediaId });
          await tx
            .update(characterMedia)
            .set({ isPrimary: false })
            .where(
              and(eq(characterMedia.characterId, characterId), eq(characterMedia.isPrimary, true)),
            );
          await tx
            .update(characterMedia)
            .set({ isPrimary: true })
            .where(
              and(eq(characterMedia.characterId, characterId), eq(characterMedia.mediaId, mediaId)),
            );
        }),
      ),

    detach: (characterId: string, mediaId: string) =>
      guard(async () => {
        await db
          .delete(characterMedia)
          .where(
            and(eq(characterMedia.characterId, characterId), eq(characterMedia.mediaId, mediaId)),
          );
      }),

    listForCharacter: (characterId: string) =>
      guard(() =>
        db
          .select({
            mediaId: mediaAssets.id,
            storageKey: mediaAssets.storageKey,
            mimeType: mediaAssets.mimeType,
            width: mediaAssets.width,
            height: mediaAssets.height,
            role: characterMedia.role,
            position: characterMedia.position,
            isPrimary: characterMedia.isPrimary,
          })
          .from(characterMedia)
          .innerJoin(mediaAssets, eq(mediaAssets.id, characterMedia.mediaId))
          .where(eq(characterMedia.characterId, characterId))
          .orderBy(
            asc(characterMedia.role),
            asc(characterMedia.position),
            asc(characterMedia.createdAt),
          ),
      ),
  };
}

export type MediaRepository = ReturnType<typeof createMediaRepository>;
