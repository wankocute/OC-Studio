"use server";

import { refresh } from "next/cache";
import { z } from "zod";

import { getDb } from "@/db";
import { MEDIA_ROLES } from "@/db/schema";
import { rejectUnauthenticatedAction } from "@/features/auth/server/session";
import { messages } from "@/i18n";
import { type ActionResult, fail, failFromError, invalidInput, ok } from "@/lib/action-result";

import { MEDIA_UPLOAD_LIMITS, UPLOAD_CONTENT_TYPES } from "./image-signature";
import {
  attachUploadedImage,
  MediaUploadError,
  removeCharacterImage,
  uploadCharacterImage,
} from "./server/media-service";
import { createStorageKey, getMediaStorage, MediaStorageUnavailableError } from "./server/storage";

const t = messages.media.errors;

const UPLOAD_MESSAGES = {
  missing: t.missing,
  empty: t.empty,
  too_large: t.tooLarge(MEDIA_UPLOAD_LIMITS.maxMegabytes),
  unsupported: t.unsupported,
  storage: t.storage,
} as const;

function uploadError(error: unknown): ActionResult<never> {
  if (error instanceof MediaUploadError) {
    return fail({ code: "upload_failed", message: UPLOAD_MESSAGES[error.code] });
  }
  if (error instanceof MediaStorageUnavailableError) {
    console.error(error.message);
    return fail({ code: "upload_failed", message: UPLOAD_MESSAGES.storage });
  }
  return failFromError(error);
}

export type UploadPlan =
  /** The browser uploads to Vercel Blob at this key, then calls `attachUploadedImageAction`. */
  | { mode: "direct"; storageKey: string }
  /** The file goes through `uploadCharacterImageAction` (local disk). */
  | { mode: "form" };

/**
 * Step 1 of an upload: decide how the file travels. With Blob, Vercel limits a request body to
 * 4.5 MB, so the browser sends the file straight to the store under a key generated here. The
 * declared type and size only give an early answer; the stored bytes are checked when attaching.
 */
export async function prepareImageUploadAction(input: unknown): Promise<ActionResult<UploadPlan>> {
  const denied = await rejectUnauthenticatedAction();
  if (denied) return denied;
  const parsed = z
    .object({ contentType: z.string().max(100), size: z.int().nonnegative() })
    .safeParse(input);
  if (!parsed.success) return invalidInput(parsed.error);
  const extension =
    UPLOAD_CONTENT_TYPES[parsed.data.contentType as keyof typeof UPLOAD_CONTENT_TYPES];
  if (!extension) return fail({ code: "upload_failed", message: UPLOAD_MESSAGES.unsupported });
  if (parsed.data.size > MEDIA_UPLOAD_LIMITS.maxBytes) {
    return fail({ code: "upload_failed", message: UPLOAD_MESSAGES.too_large });
  }
  try {
    return getMediaStorage().kind === "blob"
      ? ok({ mode: "direct", storageKey: createStorageKey(extension) })
      : ok({ mode: "form" });
  } catch (error) {
    return uploadError(error);
  }
}

/** Step 2 for direct uploads: verify the stored file and attach it to the character. */
export async function attachUploadedImageAction(input: unknown): Promise<ActionResult> {
  const denied = await rejectUnauthenticatedAction();
  if (denied) return denied;
  const parsed = z
    .object({
      characterId: z.uuid(),
      role: z.enum(MEDIA_ROLES),
      storageKey: z.string().max(200),
      filename: z.string().max(1_000).optional(),
    })
    .safeParse(input);
  if (!parsed.success) return invalidInput(parsed.error);
  try {
    await attachUploadedImage({ db: getDb(), storage: getMediaStorage() }, parsed.data);
    refresh();
    return ok();
  } catch (error) {
    return uploadError(error);
  }
}

/** Upload an avatar or reference image through the server (multipart form: characterId, role, file). */
export async function uploadCharacterImageAction(formData: FormData): Promise<ActionResult> {
  const denied = await rejectUnauthenticatedAction();
  if (denied) return denied;
  const parsed = z
    .object({ characterId: z.uuid(), role: z.enum(MEDIA_ROLES) })
    .safeParse({ characterId: formData.get("characterId"), role: formData.get("role") });
  if (!parsed.success) return invalidInput(parsed.error);

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return fail({ code: "upload_failed", message: UPLOAD_MESSAGES.missing });
  }
  // Check the declared size before reading the body into memory.
  if (file.size > MEDIA_UPLOAD_LIMITS.maxBytes) {
    return fail({ code: "upload_failed", message: UPLOAD_MESSAGES.too_large });
  }

  try {
    await uploadCharacterImage(
      { db: getDb(), storage: getMediaStorage() },
      {
        characterId: parsed.data.characterId,
        role: parsed.data.role,
        bytes: new Uint8Array(await file.arrayBuffer()),
        filename: file.name,
      },
    );
    refresh();
    return ok();
  } catch (error) {
    return uploadError(error);
  }
}

export async function removeCharacterImageAction(
  characterId: unknown,
  mediaId: unknown,
): Promise<ActionResult> {
  const denied = await rejectUnauthenticatedAction();
  if (denied) return denied;
  const parsed = z
    .object({ characterId: z.uuid(), mediaId: z.uuid() })
    .safeParse({ characterId, mediaId });
  if (!parsed.success) return invalidInput(parsed.error);
  try {
    await removeCharacterImage(
      { db: getDb(), storage: getMediaStorage() },
      parsed.data.characterId,
      parsed.data.mediaId,
    );
    refresh();
    return ok();
  } catch (error) {
    return failFromError(error);
  }
}
