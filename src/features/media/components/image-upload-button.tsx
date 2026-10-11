"use client";

import { upload as uploadToBlob } from "@vercel/blob/client";
import { ImagePlus } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { MediaRole } from "@/db/schema/library";
import {
  attachUploadedImageAction,
  prepareImageUploadAction,
  uploadCharacterImageAction,
} from "@/features/media/actions";
import { MEDIA_UPLOAD_LIMITS } from "@/features/media/image-signature";
import { messages } from "@/i18n";
import type { ActionResult } from "@/lib/action-result";

const t = messages.media;
const ACCEPT = "image/png,image/jpeg,image/webp,image/gif";
const BLOB_UPLOAD_URL = "/api/media/upload";

/**
 * With Vercel Blob the browser sends the file straight to the store (a server request is
 * limited to 4.5 MB) and the server then checks and attaches it; locally it goes through a
 * Server Action to the disk. The server picks the way and the key.
 */
async function sendImage(characterId: string, role: MediaRole, file: File): Promise<ActionResult> {
  const plan = await prepareImageUploadAction({ contentType: file.type, size: file.size });
  if (!plan.ok) return plan;
  if (plan.data.mode === "form") {
    const formData = new FormData();
    formData.set("characterId", characterId);
    formData.set("role", role);
    formData.set("file", file);
    return uploadCharacterImageAction(formData);
  }
  try {
    await uploadToBlob(plan.data.storageKey, file, {
      access: "private",
      handleUploadUrl: BLOB_UPLOAD_URL,
      contentType: file.type,
    });
  } catch {
    return { ok: false, error: { code: "upload_failed", message: t.errors.storage } };
  }
  return attachUploadedImageAction({
    characterId,
    role,
    storageKey: plan.data.storageKey,
    filename: file.name,
  });
}

function formatSize(bytes: number): string {
  return bytes >= 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/**
 * Pick an image, preview it, then upload. The browser checks size early for a quick message;
 * the server re-checks size and the actual file signature.
 */
export function ImageUploadButton({
  characterId,
  role,
  label,
  icon = <ImagePlus data-icon="inline-start" aria-hidden />,
  variant = "outline",
}: {
  characterId: string;
  role: MediaRole;
  label: string;
  icon?: ReactNode;
  variant?: "outline" | "default" | "secondary";
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [selection, setSelection] = useState<{ file: File; url: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const file = selection?.file ?? null;

  // Release the preview URL when the selection changes or the component unmounts.
  useEffect(() => {
    if (!selection) return;
    return () => URL.revokeObjectURL(selection.url);
  }, [selection]);

  const setFile = (next: File | null) =>
    setSelection(next ? { file: next, url: URL.createObjectURL(next) } : null);

  const choose = (selected: File | undefined) => {
    if (inputRef.current) inputRef.current.value = "";
    if (!selected) return;
    if (selected.size > MEDIA_UPLOAD_LIMITS.maxBytes) {
      toast.error(t.errors.tooLarge(MEDIA_UPLOAD_LIMITS.maxMegabytes));
      return;
    }
    setFile(selected);
  };

  const upload = () => {
    if (!file) return;
    startTransition(async () => {
      const result = await sendImage(characterId, role, file);
      if (result.ok) {
        toast.success(t.uploaded);
        setFile(null);
      } else {
        toast.error(result.error.message);
      }
    });
  };

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        data-testid={`upload-${role}`}
        onChange={(event) => choose(event.target.files?.[0])}
      />
      <Button variant={variant} size="sm" onClick={() => inputRef.current?.click()}>
        {icon}
        {label}
      </Button>

      <Dialog open={file !== null} onOpenChange={(open) => !open && !pending && setFile(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t.previewTitle}</DialogTitle>
            <DialogDescription>
              {file ? t.previewDescription(file.name, formatSize(file.size)) : null}
            </DialogDescription>
          </DialogHeader>
          {selection && (
            // eslint-disable-next-line @next/next/no-img-element -- local object URL preview
            <img
              src={selection.url}
              alt={t.previewTitle}
              className="mx-auto max-h-80 rounded-lg object-contain ring-1 ring-foreground/10"
            />
          )}
          <p className="text-xs text-muted-foreground">
            {t.hint(MEDIA_UPLOAD_LIMITS.maxMegabytes)}
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFile(null)} disabled={pending}>
              {messages.common.cancel}
            </Button>
            <Button onClick={upload} disabled={pending}>
              {pending ? t.uploading : t.upload}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
