"use server";

import { refresh } from "next/cache";
import { z } from "zod";

import { getDb } from "@/db";
import { MEDIA_ROLES } from "@/db/schema";
import { rejectUnauthenticatedAction } from "@/features/auth/server/session";
import { messages } from "@/i18n";
import { type ActionResult, fail, failFromError, invalidInput, ok } from "@/lib/action-result";

import { MEDIA_UPLOAD_LIMITS } from "./image-signature";
import {
  MediaUploadError,
  removeCharacterImage,
  uploadCharacterImage,
} from "./server/media-service";
import { getMediaStorage } from "./server/storage";

const t = messages.media.errors;

const UPLOAD_MESSAGES = {
  missing: t.missing,
  empty: t.empty,
  too_large: t.tooLarge(MEDIA_UPLOAD_LIMITS.maxMegabytes),
  unsupported: t.unsupported,
  storage: t.storage,
} as const;

/** Upload an avatar or reference image (multipart form: characterId, role, file). */
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
    if (error instanceof MediaUploadError) {
      return fail({ code: "upload_failed", message: UPLOAD_MESSAGES[error.code] });
    }
    return failFromError(error);
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
