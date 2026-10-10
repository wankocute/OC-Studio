import "server-only";

import type { Database } from "@/db";
import type { MediaRole } from "@/db/schema";
import { createMediaRepository, type MediaAsset } from "@/features/library/server/media-repository";

import { detectImage, MEDIA_UPLOAD_LIMITS } from "../image-signature";

import { createStorageKey, type MediaStorage } from "./storage";

export type MediaUploadErrorCode = "missing" | "empty" | "too_large" | "unsupported" | "storage";

export class MediaUploadError extends Error {
  constructor(readonly code: MediaUploadErrorCode) {
    super(`Media upload failed: ${code}`);
    this.name = "MediaUploadError";
  }
}

type Dependencies = { db: Database; storage: MediaStorage };

export type ImageUpload = {
  characterId: string;
  role: MediaRole;
  bytes: Uint8Array;
  /** Shown to the user only; never used to build paths or detect the type. */
  filename?: string;
};

function safeFilename(name: string | undefined): string | undefined {
  const cleaned = name
    ?.normalize("NFC")
    .replace(/[\u0000-\u001f\\/]/g, "")
    .trim()
    .slice(0, 255);
  return cleaned || undefined;
}

/** Delete an asset (row + file) when no character uses it any more. Failures are logged only. */
async function cleanUp({ db, storage }: Dependencies, mediaId: string): Promise<void> {
  const key = await createMediaRepository(db).deleteIfUnused(mediaId);
  if (!key) return;
  try {
    await storage.delete(key);
  } catch (error) {
    console.error("Could not delete media file", key, error);
  }
}

/**
 * Validate and store an image, then record it and attach it to the character.
 * The type comes from the file signature. If the database step fails, the stored file is
 * removed so no orphan is left behind. A replaced avatar is cleaned up if nothing else uses it.
 */
export async function uploadCharacterImage(
  dependencies: Dependencies,
  upload: ImageUpload,
): Promise<MediaAsset> {
  const { db, storage } = dependencies;
  if (upload.bytes.byteLength === 0) throw new MediaUploadError("empty");
  if (upload.bytes.byteLength > MEDIA_UPLOAD_LIMITS.maxBytes)
    throw new MediaUploadError("too_large");
  const image = detectImage(upload.bytes);
  if (!image) throw new MediaUploadError("unsupported");

  const key = createStorageKey(image.extension);
  try {
    await storage.put(key, upload.bytes);
  } catch (error) {
    console.error("Could not store media file", error);
    throw new MediaUploadError("storage");
  }

  let result: Awaited<ReturnType<ReturnType<typeof createMediaRepository>["createAndAttach"]>>;
  try {
    result = await createMediaRepository(db).createAndAttach(
      {
        storageKey: key,
        originalFilename: safeFilename(upload.filename),
        mimeType: image.mimeType,
        byteSize: upload.bytes.byteLength,
        width: image.width,
        height: image.height,
      },
      { characterId: upload.characterId, role: upload.role },
    );
  } catch (error) {
    await storage.delete(key).catch((cleanupError: unknown) => {
      console.error("Could not remove orphaned media file", key, cleanupError);
    });
    throw error;
  }

  if (result.replacedMediaId) await cleanUp(dependencies, result.replacedMediaId);
  return result.asset;
}

/** Detach an image from a character and delete the file if it is no longer used anywhere. */
export async function removeCharacterImage(
  dependencies: Dependencies,
  characterId: string,
  mediaId: string,
): Promise<void> {
  await createMediaRepository(dependencies.db).detach(characterId, mediaId);
  await cleanUp(dependencies, mediaId);
}
