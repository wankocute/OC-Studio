"use client";

import { Trash2, UserRound } from "lucide-react";
import Image from "next/image";
import { toast } from "sonner";

import { CharacterAvatar } from "@/components/shared/character-avatar";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { removeCharacterImageAction } from "@/features/media/actions";
import { messages } from "@/i18n";

import { ImageUploadButton } from "./image-upload-button";

const t = messages.media;

export type CharacterImage = {
  mediaId: string;
  width: number | null;
  height: number | null;
  originalFilename: string | null;
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

/** Large avatar with upload / replace / remove controls. */
export function AvatarEditor({
  characterId,
  name,
  avatar,
}: {
  characterId: string;
  name: string;
  avatar: CharacterImage | null;
}) {
  return (
    <div className="flex flex-col items-center gap-3">
      <CharacterAvatar name={name} mediaId={avatar?.mediaId} size="xl" />
      <div className="flex flex-wrap justify-center gap-1">
        <ImageUploadButton
          characterId={characterId}
          role="avatar"
          label={avatar ? t.changeAvatar : t.uploadAvatar}
          icon={<UserRound data-icon="inline-start" aria-hidden />}
          variant="outline"
        />
        {avatar && (
          <RemoveImageButton
            characterId={characterId}
            mediaId={avatar.mediaId}
            label={t.removeAvatar}
          />
        )}
      </div>
    </div>
  );
}

/** Reference images: thumbnails open a larger view; each can be removed. */
export function ReferenceGallery({
  characterId,
  name,
  images,
}: {
  characterId: string;
  name: string;
  images: CharacterImage[];
}) {
  return (
    <div className="space-y-4">
      {images.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t.noReferences}</p>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {images.map((image, index) => (
            <li key={image.mediaId} className="relative">
              <Dialog>
                <DialogTrigger asChild>
                  <button
                    type="button"
                    className="block aspect-square w-full overflow-hidden rounded-lg bg-muted ring-1 ring-foreground/10 outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    aria-label={`${t.viewImage} ${index + 1}`}
                  >
                    <Image
                      src={`/media/${image.mediaId}`}
                      alt={image.originalFilename ?? t.imageAlt(name)}
                      width={320}
                      height={320}
                      unoptimized
                      className="size-full object-cover transition-transform hover:scale-105"
                    />
                  </button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-3xl">
                  <DialogTitle className="truncate pr-8">
                    {image.originalFilename ?? t.imageAlt(name)}
                  </DialogTitle>
                  <Image
                    src={`/media/${image.mediaId}`}
                    alt={image.originalFilename ?? t.imageAlt(name)}
                    width={image.width ?? 1200}
                    height={image.height ?? 1200}
                    unoptimized
                    className="mx-auto max-h-[75vh] w-auto rounded-lg object-contain"
                  />
                </DialogContent>
              </Dialog>
              <RemoveImageButton
                characterId={characterId}
                mediaId={image.mediaId}
                label={`${t.removeImage} ${index + 1}`}
                compact
              />
            </li>
          ))}
        </ul>
      )}
      <ImageUploadButton characterId={characterId} role="reference" label={t.uploadReference} />
    </div>
  );
}
