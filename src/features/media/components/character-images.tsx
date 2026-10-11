"use client";

import { Crop, Trash2, UserRound } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import Image from "next/image";
import { type CSSProperties, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { CharacterAvatar } from "@/components/shared/character-avatar";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { removeCharacterImageAction, setAvatarCropAction } from "@/features/media/actions";
import type { AvatarCrop } from "@/features/media/avatar-crop";
import { MEDIA_UPLOAD_LIMITS } from "@/features/media/image-signature";
import {
  columnHeightCss,
  layoutMasonry,
  MASONRY_COLUMNS,
  tileRatio,
} from "@/features/media/masonry";
import { messages } from "@/i18n";
import { MOTION } from "@/lib/motion";

import { AvatarCropDialog } from "./avatar-crop-dialog";
import { formatSize, ImageUploadButton } from "./image-upload-button";
import { IMAGE_ACCEPT, sendImage } from "./send-image";

const t = messages.media;

export type CharacterImage = {
  mediaId: string;
  width: number | null;
  height: number | null;
  originalFilename: string | null;
  /** Avatars only. */
  crop?: AvatarCrop | null;
};

function RemoveImageButton({
  characterId,
  mediaId,
  label,
  compact = false,
}: {
  characterId: string;
  mediaId: string;
  label: string;
  compact?: boolean;
}) {
  return (
    <ConfirmDialog
      trigger={
        compact ? (
          <Button
            variant="secondary"
            size="icon-xs"
            aria-label={label}
            className="absolute top-1.5 right-1.5 opacity-90 shadow-sm"
          >
            <Trash2 aria-hidden />
          </Button>
        ) : (
          <Button variant="ghost" size="sm">
            <Trash2 data-icon="inline-start" aria-hidden />
            {label}
          </Button>
        )
      }
      title={t.removeImageTitle}
      description={t.removeImageBody}
      confirmLabel={t.removeImage}
      onConfirm={async () => {
        const result = await removeCharacterImageAction(characterId, mediaId);
        if (result.ok) toast.success(t.removed);
        else toast.error(result.error.message);
        return result.ok;
      }}
    />
  );
}

type CropSession =
  /** A newly picked file: nothing is uploaded until "Lưu". */
  | { kind: "new"; file: File; url: string }
  /** Re-cropping the stored avatar from its whole source image. */
  | { kind: "existing"; mediaId: string; crop: AvatarCrop | null };

/**
 * Large avatar with upload / re-crop / remove. A new image always goes through the crop dialog;
 * the avatar only changes after the upload and the crop were saved together.
 */
export function AvatarEditor({
  characterId,
  name,
  avatar,
}: {
  characterId: string;
  name: string;
  avatar: CharacterImage | null;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [session, setSession] = useState<CropSession | null>(null);

  // Release a picked file's object URL as soon as the dialog is done with it (or on unmount).
  useEffect(() => {
    if (session?.kind !== "new") return;
    return () => URL.revokeObjectURL(session.url);
  }, [session]);

  const choose = (file: File | undefined) => {
    if (inputRef.current) inputRef.current.value = "";
    if (!file) return;
    if (file.size > MEDIA_UPLOAD_LIMITS.maxBytes) {
      toast.error(t.errors.tooLarge(MEDIA_UPLOAD_LIMITS.maxMegabytes));
      return;
    }
    setSession({ kind: "new", file, url: URL.createObjectURL(file) });
  };

  const save = async (crop: AvatarCrop): Promise<boolean> => {
    if (!session) return false;
    const result =
      session.kind === "new"
        ? await sendImage(characterId, "avatar", session.file, crop)
        : await setAvatarCropAction({ characterId, mediaId: session.mediaId, crop });
    if (!result.ok) {
      toast.error(result.error.message);
      return false;
    }
    toast.success(session.kind === "new" ? t.uploaded : t.crop.saved);
    setSession(null);
    return true;
  };

  return (
    <div className="flex flex-col items-center gap-3">
      <CharacterAvatar name={name} mediaId={avatar?.mediaId} crop={avatar?.crop} size="xl" />
      <div className="flex flex-wrap justify-center gap-1">
        <input
          ref={inputRef}
          type="file"
          accept={IMAGE_ACCEPT}
          className="sr-only"
          tabIndex={-1}
          aria-hidden
          data-testid="upload-avatar"
          onChange={(event) => choose(event.target.files?.[0])}
        />
        <Button variant="outline" size="sm" onClick={() => inputRef.current?.click()}>
          <UserRound data-icon="inline-start" aria-hidden />
          {avatar ? t.changeAvatar : t.uploadAvatar}
        </Button>
        {avatar && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() =>
              setSession({ kind: "existing", mediaId: avatar.mediaId, crop: avatar.crop ?? null })
            }
          >
            <Crop data-icon="inline-start" aria-hidden />
            {t.crop.edit}
          </Button>
        )}
        {avatar && (
          <RemoveImageButton
            characterId={characterId}
            mediaId={avatar.mediaId}
            label={t.removeAvatar}
          />
        )}
      </div>
      <AvatarCropDialog
        open={session !== null}
        src={
          session === null
            ? null
            : session.kind === "new"
              ? session.url
              : `/media/${session.mediaId}`
        }
        description={
          session?.kind === "new"
            ? `${session.file.name} · ${formatSize(session.file.size)}`
            : undefined
        }
        initialCrop={session?.kind === "existing" ? session.crop : undefined}
        onOpenChange={(open) => !open && setSession(null)}
        onSave={save}
      />
    </div>
  );
}

/**
 * A gallery tile. Its box has the image's aspect ratio (from the stored size, corrected from the
 * loaded image when that differs — older rows, EXIF-rotated photos), and the image is
 * `object-contain`, so nothing is ever cropped or stretched.
 */
function ReferenceTile({
  characterId,
  name,
  image,
  index,
  ratio,
  style,
  onMeasured,
}: {
  characterId: string;
  name: string;
  image: CharacterImage;
  index: number;
  ratio: number;
  style: CSSProperties;
  onMeasured: (mediaId: string, ratio: number) => void;
}) {
  const alt = image.originalFilename ?? t.imageAlt(name);
  const measure = (img: HTMLImageElement | null) => {
    if (img?.complete && img.naturalWidth > 0) {
      onMeasured(image.mediaId, tileRatio(img.naturalWidth, img.naturalHeight));
    }
  };
  return (
    <motion.li
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.96, pointerEvents: "none" }}
      transition={MOTION.fade}
      style={{ ...style, aspectRatio: `1 / ${ratio}` }}
    >
      <Dialog>
        <DialogTrigger asChild>
          <button
            type="button"
            className="block size-full overflow-hidden rounded-lg bg-muted ring-1 ring-foreground/10 transition-[filter,box-shadow] duration-(--duration-fast) outline-none hover:ring-foreground/25 hover:brightness-95 focus-visible:ring-2 focus-visible:ring-ring dark:hover:brightness-110"
            aria-label={`${t.viewImage} ${index + 1}`}
          >
            <Image
              ref={measure}
              src={`/media/${image.mediaId}`}
              alt={alt}
              width={image.width ?? 600}
              height={image.height ?? 600}
              unoptimized
              draggable={false}
              onLoad={(event) => measure(event.currentTarget)}
              className="size-full object-contain"
            />
          </button>
        </DialogTrigger>
        <DialogContent className="max-h-[calc(100dvh-2rem)] sm:max-w-3xl">
          <DialogTitle className="truncate pr-8">{alt}</DialogTitle>
          <Image
            src={`/media/${image.mediaId}`}
            alt={alt}
            width={image.width ?? 1200}
            height={image.height ?? 1200}
            unoptimized
            className="mx-auto h-auto max-h-[75dvh] w-auto max-w-full rounded-lg object-contain"
          />
        </DialogContent>
      </Dialog>
      <RemoveImageButton
        characterId={characterId}
        mediaId={image.mediaId}
        label={`${t.removeImage} ${index + 1}`}
        compact
      />
    </motion.li>
  );
}

/**
 * Reference images in a masonry layout: whole images (no crop), in order, in as many columns as
 * the card's width allows. Positions come from `layoutMasonry` as CSS variables for each column
 * count; container queries in `globals.css` pick the set, so the layout is right from the first
 * paint and follows any resize. Tiles move with a CSS transition; added/removed tiles fade.
 */
export function ReferenceGallery({
  characterId,
  name,
  images,
}: {
  characterId: string;
  name: string;
  images: CharacterImage[];
}) {
  const [measured, setMeasured] = useState<Readonly<Record<string, number>>>({});
  const ratios = images.map(
    (image) => measured[image.mediaId] ?? tileRatio(image.width, image.height),
  );
  const layouts = MASONRY_COLUMNS.map((columns) => layoutMasonry(ratios, columns));
  const onMeasured = (mediaId: string, ratio: number) =>
    setMeasured((current) =>
      Math.abs((current[mediaId] ?? NaN) - ratio) < 1e-3
        ? current
        : { ...current, [mediaId]: ratio },
    );

  const containerStyle = Object.fromEntries(
    MASONRY_COLUMNS.map((columns, index) => [
      `--h${columns}`,
      `max(0px, ${layouts[index]!.columns.map(columnHeightCss).join(", ")})`,
    ]),
  ) as CSSProperties;

  return (
    <div className="space-y-4">
      {images.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t.noReferences}</p>
      ) : (
        <div className="@container">
          <ul className="masonry" style={containerStyle} data-testid="reference-gallery">
            <AnimatePresence initial={false}>
              {images.map((image, index) => {
                const style = Object.fromEntries(
                  MASONRY_COLUMNS.flatMap((columns, layoutIndex) => {
                    const tile = layouts[layoutIndex]!.tiles[index]!;
                    return [
                      [`--c${columns}`, tile.column],
                      [`--r${columns}`, tile.ratioAbove],
                      [`--n${columns}`, tile.tilesAbove],
                    ];
                  }),
                ) as CSSProperties;
                return (
                  <ReferenceTile
                    key={image.mediaId}
                    characterId={characterId}
                    name={name}
                    image={image}
                    index={index}
                    ratio={ratios[index]!}
                    style={style}
                    onMeasured={onMeasured}
                  />
                );
              })}
            </AnimatePresence>
          </ul>
        </div>
      )}
      <ImageUploadButton characterId={characterId} role="reference" label={t.uploadReference} />
    </div>
  );
}
