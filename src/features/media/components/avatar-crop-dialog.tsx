"use client";

import { ImageOff, Loader2, RotateCcw, ZoomIn, ZoomOut } from "lucide-react";
import { useId, useState } from "react";
import Cropper, { type Area } from "react-easy-crop";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  type AvatarCrop,
  avatarCropStyle,
  cropFromPercentages,
  cropToPercentages,
} from "@/features/media/avatar-crop";
import { messages } from "@/i18n";
import { cn } from "@/lib/utils";
import { useOverlayScrollbars } from "@/hooks/use-overlay-scrollbars";

const t = messages.media.crop;
const MIN_ZOOM = 1;
const MAX_ZOOM = 4;
const ZOOM_STEP = 0.1;
const CENTER = { x: 0, y: 0 };

/** Round preview of the result, drawn the same way `CharacterAvatar` draws a cropped avatar. */
function CropPreview({
  src,
  crop,
  className,
}: {
  src: string;
  crop: AvatarCrop;
  className: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "relative block shrink-0 overflow-hidden rounded-full bg-muted ring-1 ring-foreground/10",
        className,
      )}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- same source as the cropper */}
      <img src={src} alt="" draggable={false} style={avatarCropStyle(crop)} />
    </span>
  );
}

function CropperBody({
  src,
  description,
  initialCrop,
  onCancel,
  onSave,
}: {
  src: string;
  description?: string;
  initialCrop?: AvatarCrop | null;
  onCancel: () => void;
  onSave: (crop: AvatarCrop) => Promise<boolean>;
}) {
  const zoomId = useId();
  const [position, setPosition] = useState(CENTER);
  const [zoom, setZoom] = useState(MIN_ZOOM);
  const [area, setArea] = useState<AvatarCrop | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "failed">("loading");
  const [saving, setSaving] = useState(false);

  const changeZoom = (value: number) =>
    setZoom(Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round(value * 100) / 100)));

  const save = async () => {
    if (!area || saving) return;
    setSaving(true);
    // The parent closes the dialog on success; on failure the user keeps their framing.
    const saved = await onSave(area);
    if (!saved) setSaving(false);
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>{initialCrop === undefined ? t.title : t.editTitle}</DialogTitle>
        <DialogDescription>{description ?? t.description}</DialogDescription>
      </DialogHeader>

      <div className="relative h-64 overflow-hidden rounded-lg bg-muted sm:h-80">
        {status === "failed" ? (
          <p
            role="alert"
            className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center text-muted-foreground"
          >
            <ImageOff className="size-6" aria-hidden />
            {t.loadFailed}
          </p>
        ) : (
          <>
            <Cropper
              image={src}
              crop={position}
              zoom={zoom}
              minZoom={MIN_ZOOM}
              maxZoom={MAX_ZOOM}
              aspect={1}
              cropShape="round"
              showGrid={false}
              objectFit="contain"
              onCropChange={setPosition}
              onZoomChange={changeZoom}
              onCropAreaChange={(percentages: Area) => setArea(cropFromPercentages(percentages))}
              onMediaLoaded={() => setStatus("ready")}
              initialCroppedAreaPercentages={
                initialCrop ? cropToPercentages(initialCrop) : undefined
              }
              mediaProps={{ onError: () => setStatus("failed") }}
              cropperProps={{ "aria-label": t.area }}
              classes={{
                cropAreaClassName: "outline-none focus-visible:ring-3 focus-visible:ring-ring",
              }}
            />
            {status === "loading" && (
              <p className="absolute inset-0 flex items-center justify-center gap-2 text-muted-foreground">
                <Loader2 className="size-4 animate-spin" aria-hidden />
                {t.loading}
              </p>
            )}
          </>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <div className="flex min-w-0 flex-1 items-center gap-1.5">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={t.zoomOut}
            disabled={status !== "ready" || zoom <= MIN_ZOOM}
            onClick={() => changeZoom(zoom - ZOOM_STEP * 2)}
          >
            <ZoomOut aria-hidden />
          </Button>
          <label htmlFor={zoomId} className="sr-only">
            {t.zoom}
          </label>
          <input
            id={zoomId}
            type="range"
            min={MIN_ZOOM}
            max={MAX_ZOOM}
            step={ZOOM_STEP}
            value={zoom}
            disabled={status !== "ready"}
            onChange={(event) => changeZoom(Number(event.target.value))}
            className="h-2 min-w-0 flex-1 cursor-pointer accent-primary disabled:cursor-not-allowed"
          />
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={t.zoomIn}
            disabled={status !== "ready" || zoom >= MAX_ZOOM}
            onClick={() => changeZoom(zoom + ZOOM_STEP * 2)}
          >
            <ZoomIn aria-hidden />
          </Button>
        </div>
        {area && status === "ready" && (
          <div className="flex items-center gap-2" data-testid="avatar-crop-preview">
            <span className="text-xs text-muted-foreground">{t.preview}</span>
            <CropPreview src={src} crop={area} className="size-14" />
            <CropPreview src={src} crop={area} className="size-8" />
          </div>
        )}
      </div>

      <DialogFooter className="gap-2 sm:justify-between">
        <Button
          type="button"
          variant="ghost"
          disabled={status !== "ready" || saving}
          onClick={() => {
            setPosition(CENTER);
            changeZoom(MIN_ZOOM);
          }}
        >
          <RotateCcw data-icon="inline-start" aria-hidden />
          {t.reset}
        </Button>
        <div className="flex flex-col-reverse gap-2 sm:flex-row">
          <Button type="button" variant="outline" onClick={onCancel} disabled={saving}>
            {t.cancel}
          </Button>
          <Button type="button" onClick={save} disabled={status !== "ready" || !area || saving}>
            {saving && <Loader2 data-icon="inline-start" className="animate-spin" aria-hidden />}
            {saving ? t.saving : t.save}
          </Button>
        </div>
      </DialogFooter>
    </>
  );
}

/**
 * Choose the visible square of an avatar: drag to position, pinch / wheel / slider to zoom.
 * The source image is never modified; only the crop (fractions of the image) is saved, so it
 * can be changed again later. `initialCrop`: `undefined` for a new image, `null` for a stored
 * avatar without a crop (centred), or the stored crop.
 */
export function AvatarCropDialog({
  src,
  open,
  description,
  initialCrop,
  onOpenChange,
  onSave,
}: {
  src: string | null;
  open: boolean;
  description?: string;
  initialCrop?: AvatarCrop | null;
  onOpenChange: (open: boolean) => void;
  onSave: (crop: AvatarCrop) => Promise<boolean>;
}) {
  const [saving, setSaving] = useState(false);
  const scrollbars = useOverlayScrollbars<HTMLDivElement>();
  return (
    <Dialog
      open={open && src !== null}
      // Closing (Escape, overlay, close button) is the same as "Hủy" — except mid-save.
      onOpenChange={(next) => !saving && onOpenChange(next)}
    >
      <DialogContent
        ref={scrollbars}
        className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg"
      >
        {src && (
          <CropperBody
            key={src}
            src={src}
            description={description}
            initialCrop={initialCrop}
            onCancel={() => onOpenChange(false)}
            onSave={async (crop) => {
              setSaving(true);
              try {
                return await onSave(crop);
              } finally {
                setSaving(false);
              }
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
