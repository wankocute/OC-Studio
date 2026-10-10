"use client";

import { Pencil, Plus, Trash2, UserPlus, X } from "lucide-react";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { type FormEvent, type ReactNode, useId, useState, useTransition } from "react";
import { toast } from "sonner";
import { z } from "zod";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import {
  addToCollectionAction,
  createCollectionAction,
  deleteCollectionAction,
  removeFromCollectionAction,
  updateCollectionAction,
} from "@/features/library/actions";
import { messages } from "@/i18n";
import type { ActionResult } from "@/lib/action-result";

const t = messages.collections;

const formSchema = z.object({
  name: z
    .string()
    .transform((value) => value.normalize("NFC").trim())
    .pipe(
      z
        .string()
        .min(1, t.validation.nameRequired)
        .max(200, messages.characters.validation.tooLong(200)),
    ),
  description: z.string().max(2_000, messages.characters.validation.tooLong(2_000)),
});

type CollectionFormValues = { name: string; description: string };

function CollectionFormDialog({
  trigger,
  title,
  description,
  initial,
  submitLabel,
  onSubmit,
}: {
  trigger: ReactNode;
  title: string;
  description?: string;
  initial: CollectionFormValues;
  submitLabel: string;
  onSubmit: (values: CollectionFormValues) => Promise<ActionResult<unknown>>;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState(initial);
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const parsed = formSchema.safeParse(values);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message);
      return;
    }
    startTransition(async () => {
      const result = await onSubmit(values);
      if (result.ok) setOpen(false);
      else
        setError(
          result.error.code === "duplicate" ? messages.errors.duplicate : result.error.message,
        );
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (pending) return;
        if (next) {
          setValues(initial);
          setError(undefined);
        }
        setOpen(next);
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <form onSubmit={submit} noValidate className="space-y-5">
          <DialogHeader>
            <DialogTitle className="font-heading text-xl">{title}</DialogTitle>
            {description && <DialogDescription>{description}</DialogDescription>}
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor={`${id}-name`}>
              {t.name} <span className="text-destructive">*</span>
            </Label>
            <Input
              id={`${id}-name`}
              value={values.name}
              onChange={(event) => setValues({ ...values, name: event.target.value })}
              autoFocus
              required
              disabled={pending}
              aria-invalid={Boolean(error)}
              aria-describedby={error ? `${id}-error` : undefined}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${id}-description`}>
              {t.descriptionField}{" "}
              <span className="font-normal text-muted-foreground">
                ({messages.common.optional})
              </span>
            </Label>
            <Textarea
              id={`${id}-description`}
              value={values.description}
              onChange={(event) => setValues({ ...values, description: event.target.value })}
              rows={3}
              disabled={pending}
            />
          </div>
          {error && (
            <p id={`${id}-error`} role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={pending}
            >
              {messages.common.cancel}
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? messages.common.saving : submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function CreateCollectionButton({
  variant = "default",
}: {
  variant?: "default" | "outline";
}) {
  return (
    <CollectionFormDialog
      trigger={
        <Button variant={variant}>
          <Plus data-icon="inline-start" aria-hidden />
          {t.create}
        </Button>
      }
      title={t.create}
      description={t.createDescription}
      initial={{ name: "", description: "" }}
      submitLabel={messages.common.create}
      onSubmit={async (values) => {
        const result = await createCollectionAction(values);
        if (result.ok) toast.success(t.created);
        return result;
      }}
    />
  );
}

export function EditCollectionButton({
  collection,
  compact = false,
}: {
  collection: { id: string; name: string; description: string | null };
  compact?: boolean;
}) {
  return (
    <CollectionFormDialog
      trigger={
        compact ? (
          <Button variant="ghost" size="icon-sm" aria-label={`${t.edit}: ${collection.name}`}>
            <Pencil aria-hidden className="text-muted-foreground" />
          </Button>
        ) : (
          <Button variant="outline" size="sm">
            <Pencil data-icon="inline-start" aria-hidden />
            {messages.common.edit}
          </Button>
        )
      }
      title={t.edit}
      initial={{ name: collection.name, description: collection.description ?? "" }}
      submitLabel={messages.common.save}
      onSubmit={async (values) => {
        const result = await updateCollectionAction(collection.id, values);
        if (result.ok) toast.success(t.renamed);
        return result;
      }}
    />
  );
}

export function DeleteCollectionButton({
  collection,
  compact = false,
  redirectToList = false,
}: {
  collection: { id: string; name: string };
  compact?: boolean;
  redirectToList?: boolean;
}) {
  const router = useRouter();
  return (
    <ConfirmDialog
      trigger={
        compact ? (
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`${messages.common.delete}: ${collection.name}`}
          >
            <Trash2 aria-hidden className="text-muted-foreground" />
          </Button>
        ) : (
          <Button variant="outline" size="sm">
            <Trash2 data-icon="inline-start" aria-hidden />
            {messages.common.delete}
          </Button>
        )
      }
      title={t.deleteTitle(collection.name)}
      description={t.deleteBody}
      confirmLabel={messages.common.delete}
      onConfirm={async () => {
        const result = await deleteCollectionAction(collection.id, !redirectToList);
        if (!result.ok) {
          toast.error(result.error.message);
          return false;
        }
        toast.success(t.deleted);
        if (redirectToList) router.push("/collections" as Route);
        return true;
      }}
    />
  );
}

/** Pick characters (not yet in the collection) to add. */
export function AddCharacterToCollection({
  collectionId,
  candidates,
}: {
  collectionId: string;
  candidates: { id: string; displayName: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button disabled={pending}>
          <UserPlus data-icon="inline-start" aria-hidden />
          {t.addCharacter}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="end">
        <Command>
          <CommandInput placeholder={t.addCharacterSearch} />
          <CommandList>
            <CommandEmpty>
              {candidates.length === 0 ? t.noCharactersToAdd : messages.common.noMatches}
            </CommandEmpty>
            <CommandGroup>
              {candidates.map((character) => (
                <CommandItem
                  key={character.id}
                  value={`${character.displayName} ${character.id}`}
                  disabled={pending}
                  onSelect={() => {
                    setOpen(false);
                    startTransition(async () => {
                      const result = await addToCollectionAction(collectionId, character.id);
                      if (result.ok) toast.success(t.added);
                      else toast.error(result.error.message);
                    });
                  }}
                >
                  {character.displayName}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export function RemoveFromCollectionButton({
  collectionId,
  character,
}: {
  collectionId: string;
  character: { id: string; displayName: string };
}) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      disabled={pending}
      aria-label={t.removeFromCollection(character.displayName)}
      title={t.removeFromCollection(character.displayName)}
      onClick={() =>
        startTransition(async () => {
          const result = await removeFromCollectionAction(collectionId, character.id);
          if (result.ok) toast.success(t.removedMember);
          else toast.error(result.error.message);
        })
      }
    >
      <X aria-hidden className="text-muted-foreground" />
    </Button>
  );
}
