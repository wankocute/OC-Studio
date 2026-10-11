"use client";

import { Pencil, Plus, Star, Trash2 } from "lucide-react";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import { useOptimistic, useTransition } from "react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Button } from "@/components/ui/button";
import {
  createCharacterAction,
  deleteCharacterAction,
  setFavoriteAction,
  updateCharacterBasicsAction,
} from "@/features/characters/actions";
import type { BasicInfoFormState } from "@/features/characters/basic-info";
import { messages } from "@/i18n";
import { DURATION, EASE_OUT } from "@/lib/motion";
import { cn } from "@/lib/utils";

import { BasicInfoDialog } from "./basic-info-dialog";

const t = messages.characters;

const EMPTY_FORM: BasicInfoFormState = {
  values: {
    displayName: "",
    fullName: "",
    age: "",
    ageApproximate: false,
    genderIdentity: "",
    genderOther: "",
    pronouns: "",
    species: "",
    occupation: "",
  },
  locked: {},
};

export function CreateCharacterButton({
  variant = "default",
  className,
}: {
  variant?: "default" | "outline";
  className?: string;
}) {
  const router = useRouter();
  return (
    <BasicInfoDialog
      trigger={
        <Button variant={variant} className={className}>
          <Plus data-icon="inline-start" aria-hidden />
          {t.create}
        </Button>
      }
      title={t.create}
      description={t.createDescription}
      submitLabel={messages.common.create}
      pendingLabel={messages.common.creating}
      initial={EMPTY_FORM}
      onSubmit={async (values) => {
        const result = await createCharacterAction(values);
        if (result.ok) {
          toast.success(t.created);
          router.push(`/characters/${result.data.id}` as Route);
        }
        return result;
      }}
    />
  );
}

export function EditBasicInfoButton({
  characterId,
  revision,
  initial,
}: {
  characterId: string;
  revision: number;
  initial: BasicInfoFormState;
}) {
  return (
    <BasicInfoDialog
      trigger={
        <Button variant="outline" size="sm">
          <Pencil data-icon="inline-start" aria-hidden />
          {messages.common.edit}
        </Button>
      }
      title={t.editBasicInfo}
      description={t.basicInfoDescription}
      submitLabel={messages.common.save}
      pendingLabel={messages.common.saving}
      initial={initial}
      onSubmit={async (values) => {
        const result = await updateCharacterBasicsAction(characterId, revision, values);
        // Conflicts are shown inside the dialog, which keeps the user's input visible.
        if (result.ok) toast.success(t.updated);
        return result;
      }}
    />
  );
}

export function FavoriteButton({
  characterId,
  isFavorite,
  size = "icon-sm",
  className,
}: {
  characterId: string;
  isFavorite: boolean;
  size?: "icon-sm" | "icon";
  className?: string;
}) {
  const [pending, startTransition] = useTransition();
  // Flip at once; the server's answer (or a failure) settles the real value.
  const [shown, setShown] = useOptimistic(isFavorite);
  const label = shown ? t.removeFavorite : t.addFavorite;
  return (
    <Button
      variant="ghost"
      size={size}
      aria-label={label}
      aria-pressed={shown}
      title={label}
      disabled={pending}
      className={className}
      onClick={() =>
        startTransition(async () => {
          setShown(!isFavorite);
          const result = await setFavoriteAction(characterId, !isFavorite);
          if (result.ok) toast.success(isFavorite ? t.favoriteRemoved : t.favoriteAdded);
          else toast.error(result.error.message);
        })
      }
    >
      {/* A small pop when turned on, a dip when turned off; starts from the current scale. */}
      <motion.span
        className="inline-flex"
        initial={false}
        animate={
          shown ? { scale: [null, 1.3, 1], rotate: [null, -14, 0] } : { scale: [null, 0.82, 1] }
        }
        transition={{ duration: DURATION.slow, ease: EASE_OUT }}
      >
        <Star
          aria-hidden
          className={cn(
            "transition-colors duration-(--duration-base)",
            shown ? "fill-warning text-warning" : "text-muted-foreground",
          )}
        />
      </motion.span>
    </Button>
  );
}

export function DeleteCharacterButton({
  characterId,
  revision,
  name,
  /** Navigate to the library after deleting (used on the detail page). */
  redirectToLibrary = false,
  compact = false,
}: {
  characterId: string;
  revision: number;
  name: string;
  redirectToLibrary?: boolean;
  compact?: boolean;
}) {
  const router = useRouter();
  return (
    <ConfirmDialog
      trigger={
        compact ? (
          <Button variant="ghost" size="icon-sm" aria-label={`${messages.common.delete} ${name}`}>
            <Trash2 aria-hidden className="text-muted-foreground" />
          </Button>
        ) : (
          <Button variant="outline" size="sm">
            <Trash2 data-icon="inline-start" aria-hidden />
            {messages.common.delete}
          </Button>
        )
      }
      title={t.deleteTitle(name)}
      description={t.deleteBody}
      confirmLabel={t.deleteConfirm}
      onConfirm={async () => {
        const result = await deleteCharacterAction(characterId, revision, !redirectToLibrary);
        if (!result.ok) {
          toast.error(result.error.message);
          return result.error.code === "revision_conflict";
        }
        toast.success(t.deleted);
        if (redirectToLibrary) router.push("/characters");
        return true;
      }}
    />
  );
}
