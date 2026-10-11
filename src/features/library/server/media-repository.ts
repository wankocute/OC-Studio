import "server-only";

import { and, asc, eq, sql } from "drizzle-orm";
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

function parseAsset(input: MediaAssetInput) {
  const result = mediaAssetInputSchema.safeParse(input);
  if (!result.success) {
    throw new RepositoryError("validation_failed", {
      issues: result.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
    });
  }
  return result.data;
}

export function createMediaRepository(db: Database) {
  return {
    createAsset: (input: MediaAssetInput) =>
      guard(async () => {
        const [row] = await db.insert(mediaAssets).values(parseAsset(input)).returning();
        return row!;
      }),

    /** Whether any asset already records this storage key (an upload must use a fresh one). */
    hasStorageKey: (storageKey: string) =>
      guard(async () => {
        const [row] = await db
          .select({ id: mediaAssets.id })
          .from(mediaAssets)
          .where(eq(mediaAssets.storageKey, storageKey))
          .limit(1);
        return Boolean(row);
      }),

    getAsset: (id: string) =>
      guard(async () => {
        const [row] = await db.select().from(mediaAssets).where(eq(mediaAssets.id, id));
        if (!row) throw new RepositoryError("not_found", { entity: "media_asset", id });
        return row;
      }),

    /**
     * Record a stored file and attach it to a character in one transaction. An avatar replaces
     * the current avatar link; references go to the end of the gallery. Returns the replaced
     * avatar's id so the caller can clean it up if nothing else uses it.
     */
    createAndAttach: (input: MediaAssetInput, target: { characterId: string; role: MediaRole }) =>
      guard(() =>
        db.transaction(async (tx) => {
          if (!MEDIA_ROLES.includes(target.role)) {
            throw new RepositoryError("validation_failed", {
              issues: [{ path: "role", message: "Vai trò ảnh không hợp lệ." }],
            });
          }
          await assertActiveCharacter(tx, target.characterId);
          const [asset] = await tx.insert(mediaAssets).values(parseAsset(input)).returning();

          let replacedMediaId: string | null = null;
          let position = 0;
          if (target.role === "avatar") {
            const [previous] = await tx
              .delete(characterMedia)
              .where(
                and(
                  eq(characterMedia.characterId, target.characterId),
                  eq(characterMedia.role, "avatar"),
                ),
              )
              .returning({ mediaId: characterMedia.mediaId });
            replacedMediaId = previous?.mediaId ?? null;
          } else {
            const [last] = await tx
              .select({ next: sql<number>`coalesce(max(${characterMedia.position}) + 1, 0)` })
              .from(characterMedia)
              .where(
                and(
                  eq(characterMedia.characterId, target.characterId),
                  eq(characterMedia.role, "reference"),
                ),
              );
            position = Number(last?.next ?? 0);
          }

          await tx.insert(characterMedia).values({
            characterId: target.characterId,
            mediaId: asset!.id,
            role: target.role,
            position,
          });
          return { asset: asset!, replacedMediaId };
        }),
      ),

    /**
     * Delete an asset row that no character uses any more. Returns its storage key (so the
     * caller deletes the file after the transaction) or `null` when it is still in use.
     */
    deleteIfUnused: (mediaId: string) =>
      guard(() =>
        db.transaction(async (tx) => {
          const [asset] = await tx
            .select({ storageKey: mediaAssets.storageKey })
            .from(mediaAssets)
            .where(eq(mediaAssets.id, mediaId))
            .for("update");
          if (!asset) return null;
          const [link] = await tx
            .select({ mediaId: characterMedia.mediaId })
            .from(characterMedia)
            .where(eq(characterMedia.mediaId, mediaId))
            .limit(1);
          if (link) return null;
          await tx.delete(mediaAssets).where(eq(mediaAssets.id, mediaId));
          return asset.storageKey;
        }),
      ),

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
            originalFilename: mediaAssets.originalFilename,
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
