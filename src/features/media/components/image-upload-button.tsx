"use client";

import { ImagePlus, X } from "lucide-react";
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
import { MEDIA_UPLOAD_LIMITS } from "@/features/media/image-signature";
import { messages } from "@/i18n";
import { useOverlayScrollbars } from "@/hooks/use-overlay-scrollbars";

import { IMAGE_ACCEPT, sendImage } from "./send-image";

const t = messages.media;

export function formatSize(bytes: number): string {
  return bytes >= 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

type Selected = { id: string; file: File; url: string };

/**
 * Pick one or more images, preview them, then upload. The browser checks size early for a quick
 * message; the server re-checks size and the actual file signature of every file. Files are sent
 * one after another through the same path as a single upload; a file that fails stays in the
 * list so it can be retried, the others are kept.
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
  const [selection, setSelection] = useState<Selected[]>([]);
  const scrollbars = useOverlayScrollbars<HTMLDivElement>();
  const [progress, setProgress] = useState<number | null>(null);
  const [pending, startTransition] = useTransition();
  const urls = useRef(new Map<string, string>());

  // Release preview URLs of files that left the selection, and all of them on unmount.
  useEffect(() => {
    const kept = new Set(selection.map((item) => item.id));
    for (const [id, url] of urls.current) {
      if (kept.has(id)) continue;
      URL.revokeObjectURL(url);
      urls.current.delete(id);
    }
  }, [selection]);
  useEffect(() => {
    const current = urls.current;
    return () => {
      for (const url of current.values()) URL.revokeObjectURL(url);
      current.clear();
    };
  }, []);

  const choose = (files: FileList | null) => {
    const picked = Array.from(files ?? []);
    if (inputRef.current) inputRef.current.value = "";
    const tooLarge = picked.filter((file) => file.size > MEDIA_UPLOAD_LIMITS.maxBytes);
    if (tooLarge.length) toast.error(t.errors.tooLarge(MEDIA_UPLOAD_LIMITS.maxMegabytes));
    const accepted = picked
      .filter((file) => file.size <= MEDIA_UPLOAD_LIMITS.maxBytes)
      .map((file) => {
        const id = crypto.randomUUID();
        const url = URL.createObjectURL(file);
        urls.current.set(id, url);
        return { id, file, url };
      });
    if (accepted.length) setSelection(accepted);
  };

  const clear = () => setSelection([]);

  const upload = () => {
    if (!selection.length) return;
    const items = selection;
    startTransition(async () => {
      const failed: Selected[] = [];
      let firstError: string | null = null;
      for (const [index, item] of items.entries()) {
        setProgress(index + 1);
        let message: string | null = null;
        try {
          const result = await sendImage(characterId, role, item.file);
          if (!result.ok) message = result.error.message;
        } catch {
          message = t.errors.storage;
        }
        if (message) {
          failed.push(item);
          firstError ??= message;
        }
      }
      setProgress(null);
      const done = items.length - failed.length;
      if (done > 0) toast.success(items.length === 1 ? t.uploaded : t.uploadedMany(done));
      if (failed.length) {
        toast.error(
          items.length === 1 ? firstError : `${firstError} ${t.uploadPartlyFailed(failed.length)}`,
        );
      }
      setSelection(failed);
    });
  };

  const single = selection.length === 1 ? selection[0] : null;
  const totalSize = selection.reduce((sum, item) => sum + item.file.size, 0);

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept={IMAGE_ACCEPT}
        multiple
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        data-testid={`upload-${role}`}
        onChange={(event) => choose(event.target.files)}
      />
      <Button variant={variant} size="sm" onClick={() => inputRef.current?.click()}>
        {icon}
        {label}
      </Button>

      <Dialog open={selection.length > 0} onOpenChange={(open) => !open && !pending && clear()}>
        <DialogContent ref={scrollbars} className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t.previewTitle}</DialogTitle>
            <DialogDescription>
              {single
                ? t.previewDescription(single.file.name, formatSize(single.file.size))
                : t.previewDescriptionMany(selection.length, formatSize(totalSize))}
            </DialogDescription>
          </DialogHeader>
          {single ? (
            // eslint-disable-next-line @next/next/no-img-element -- local object URL preview
            <img
              src={single.url}
              alt={t.previewTitle}
              className="mx-auto max-h-80 rounded-lg object-contain ring-1 ring-foreground/10"
            />
          ) : (
            <ul className="grid grid-cols-3 gap-2">
              {selection.map((item) => (
                <li key={item.id} className="group relative">
                  {/* eslint-disable-next-line @next/next/no-img-element -- local object URL preview */}
                  <img
                    src={item.url}
                    alt={item.file.name}
                    title={`${item.file.name} · ${formatSize(item.file.size)}`}
                    className="aspect-square w-full rounded-lg object-cover ring-1 ring-foreground/10"
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    size="icon-xs"
                    className="absolute top-1 right-1 rounded-full shadow-sm"
                    aria-label={t.removeFromSelection(item.file.name)}
                    disabled={pending}
                    onClick={() =>
                      setSelection((current) => current.filter((other) => other.id !== item.id))
                    }
                  >
                    <X aria-hidden />
                  </Button>
                </li>
              ))}
            </ul>
          )}
          <p className="text-xs text-muted-foreground">
            {t.hint(MEDIA_UPLOAD_LIMITS.maxMegabytes)}
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={clear} disabled={pending}>
              {messages.common.cancel}
            </Button>
            <Button onClick={upload} disabled={pending}>
              {pending
                ? selection.length > 1 && progress !== null
                  ? t.uploadingProgress(progress, selection.length)
                  : t.uploading
                : t.upload}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
