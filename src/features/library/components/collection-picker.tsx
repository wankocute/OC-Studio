"use client";

import { Check, LibraryBig, X } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { addToCollectionAction, removeFromCollectionAction } from "@/features/library/actions";
import { messages } from "@/i18n";

const t = messages.collections;

type CollectionOption = { id: string; name: string };

/** Collections a character belongs to, with add/remove. Collections are created on /collections. */
export function CollectionPicker({
  characterId,
  selected,
  available,
}: {
  characterId: string;
  selected: CollectionOption[];
  available: CollectionOption[];
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const selectedIds = new Set(selected.map((item) => item.id));

  const run = (
    action: () => Promise<{ ok: boolean; error?: { message: string } }>,
    success: string,
  ) =>
    startTransition(async () => {
      const result = await action();
      if (result.ok) toast.success(success);
      else toast.error(result.error?.message);
    });

  return (
    <div className="space-y-3">
      {selected.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t.notInAny}</p>
      ) : (
        <ul className="space-y-1" aria-label={t.memberOf}>
          {selected.map((collection) => (
            <li key={collection.id} className="flex items-center justify-between gap-2">
              <Link
                href={`/collections/${collection.id}` as Route}
                className="truncate text-sm font-medium underline-offset-4 outline-none hover:underline focus-visible:underline"
              >
                {collection.name}
              </Link>
              <Button
                variant="ghost"
                size="icon-xs"
                disabled={pending}
                aria-label={t.removeFromCollection(collection.name)}
                onClick={() =>
                  run(() => removeFromCollectionAction(collection.id, characterId), t.removedMember)
                }
              >
                <X aria-hidden />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" disabled={pending}>
            <LibraryBig data-icon="inline-start" aria-hidden />
            {t.addToCollection}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-64 p-0" align="start">
          <Command>
            <CommandInput placeholder={t.searchCollections} />
            <CommandList>
              <CommandEmpty>
                {available.length === 0 ? t.noCollections : messages.common.noMatches}
              </CommandEmpty>
              <CommandGroup>
                {available.map((collection) => {
                  const isSelected = selectedIds.has(collection.id);
                  return (
                    <CommandItem
                      key={collection.id}
                      value={collection.name}
                      disabled={isSelected || pending}
                      onSelect={() => {
                        setOpen(false);
                        run(() => addToCollectionAction(collection.id, characterId), t.added);
                      }}
                    >
                      <Check className={isSelected ? "opacity-100" : "opacity-0"} aria-hidden />
                      {collection.name}
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}
