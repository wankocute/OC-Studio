import { upload as uploadToBlob } from "@vercel/blob/client";

import type { MediaRole } from "@/db/schema/library";
import type { AvatarCrop } from "@/features/media/avatar-crop";
import {
  attachUploadedImageAction,
  prepareImageUploadAction,
  uploadCharacterImageAction,
} from "@/features/media/actions";
import { messages } from "@/i18n";
import type { ActionResult } from "@/lib/action-result";

const BLOB_UPLOAD_URL = "/api/media/upload";

/** Formats the file picker offers; the server still checks the actual file signature. */
export const IMAGE_ACCEPT = "image/png,image/jpeg,image/webp,image/gif";

/**
 * With Vercel Blob the browser sends the file straight to the store (a server request is
 * limited to 4.5 MB) and the server then checks and attaches it; locally it goes through a
 * Server Action to the disk. The server picks the way and the key. An avatar's crop is attached
 * in the same database step, so the avatar only changes once everything succeeded.
 */
export async function sendImage(
  characterId: string,
  role: MediaRole,
  file: File,
  crop?: AvatarCrop,
): Promise<ActionResult> {
  const plan = await prepareImageUploadAction({ contentType: file.type, size: file.size });
  if (!plan.ok) return plan;
  if (plan.data.mode === "form") {
    const formData = new FormData();
    formData.set("characterId", characterId);
    formData.set("role", role);
    formData.set("file", file);
    if (crop) formData.set("crop", JSON.stringify(crop));
    return uploadCharacterImageAction(formData);
  }
  try {
    await uploadToBlob(plan.data.storageKey, file, {
      access: "private",
      handleUploadUrl: BLOB_UPLOAD_URL,
      contentType: file.type,
    });
  } catch {
    return { ok: false, error: { code: "upload_failed", message: messages.media.errors.storage } };
  }
  return attachUploadedImageAction({
    characterId,
    role,
    storageKey: plan.data.storageKey,
    filename: file.name,
    crop,
  });
}
