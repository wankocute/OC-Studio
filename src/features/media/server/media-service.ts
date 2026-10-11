import "server-only";

import type { Database } from "@/db";
import { isRepositoryError } from "@/db/repository-errors";
import type { MediaRole } from "@/db/schema";
import { createMediaRepository, type MediaAsset } from "@/features/library/server/media-repository";

import type { AvatarCrop } from "../avatar-crop";
import { detectImage, type DetectedImage, MEDIA_UPLOAD_LIMITS } from "../image-signature";

import { createStorageKey, isValidStorageKey, type MediaStorage, readStoredBytes } from "./storage";

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
  /** Avatars only: the visible square, chosen before upload (see `avatar-crop.ts`). */
  crop?: AvatarCrop;
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

function checkImage(bytes: Uint8Array): DetectedImage {
  if (bytes.byteLength === 0) throw new MediaUploadError("empty");
  if (bytes.byteLength > MEDIA_UPLOAD_LIMITS.maxBytes) throw new MediaUploadError("too_large");
  const image = detectImage(bytes);
  if (!image) throw new MediaUploadError("unsupported");
  return image;
}

async function removeStored(storage: MediaStorage, key: string) {
  await storage.delete(key).catch((cleanupError: unknown) => {
    console.error("Could not remove orphaned media file", key, cleanupError);
  });
}

/**
 * Validate and store an image (sent through the server: local disk), then record it and attach
 * it to the character. The type comes from the file signature. A replaced avatar is cleaned up
 * if nothing else uses it.
 */
export async function uploadCharacterImage(
  dependencies: Dependencies,
  upload: ImageUpload,
): Promise<MediaAsset> {
  const image = checkImage(upload.bytes);
  const key = createStorageKey(image.extension);
  try {
    await dependencies.storage.put(key, upload.bytes, image.mimeType);
  } catch (error) {
    console.error("Could not store media file", error);
    throw new MediaUploadError("storage");
  }
  return recordAndAttach(dependencies, key, image, upload);
}

export type UploadedImage = Omit<ImageUpload, "bytes"> & { storageKey: string };

/**
 * Attach an image the browser uploaded straight to storage (Vercel Blob). Nothing about the
 * upload is trusted: the stored bytes are read back, size and signature checked, and a file that
 * fails is deleted. Keys already recorded are refused (never deleted), so this can only attach a
 * fresh upload.
 */
export async function attachUploadedImage(
  dependencies: Dependencies,
  upload: UploadedImage,
): Promise<MediaAsset> {
  const { db, storage } = dependencies;
  const key = upload.storageKey;
  if (!isValidStorageKey(key)) throw new MediaUploadError("missing");
  if (await createMediaRepository(db).hasStorageKey(key)) throw new MediaUploadError("missing");

  let bytes: Awaited<ReturnType<typeof readStoredBytes>>;
  try {
    bytes = await readStoredBytes(storage, key, MEDIA_UPLOAD_LIMITS.maxBytes);
  } catch (error) {
    console.error("Could not read uploaded media file", key, error);
    throw new MediaUploadError("storage");
  }
  if (bytes === "missing") throw new MediaUploadError("missing");
  let image: DetectedImage;
  try {
    if (bytes === "too_large") throw new MediaUploadError("too_large");
    image = checkImage(bytes);
  } catch (error) {
    await removeStored(storage, key);
    throw error;
  }
  return recordAndAttach(dependencies, key, image, { ...upload, bytes });
}

/**
 * Record a stored file and attach it. If the database step fails, the stored file is removed so
 * no orphan is left behind.
 */
async function recordAndAttach(
  dependencies: Dependencies,
  key: string,
  image: DetectedImage,
  upload: ImageUpload,
): Promise<MediaAsset> {
  const { db, storage } = dependencies;
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
      { characterId: upload.characterId, role: upload.role, crop: upload.crop },
    );
  } catch (error) {
    // A duplicate key means another request recorded this very file: it is in use, keep it.
    if (!isRepositoryError(error, "duplicate")) await removeStored(storage, key);
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
