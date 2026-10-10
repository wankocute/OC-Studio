"use client";

import { Check, Plus, Tag, X } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
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
import { addTagAction, removeTagAction } from "@/features/library/actions";
import { messages } from "@/i18n";

const t = messages.tags;

type TagOption = { id: string; name: string };

/** Tags of one character: remove with the chip's button, add or create from the picker. */
export function TagPicker({
  characterId,
  selected,
  available,
}: {
  characterId: string;
  selected: TagOption[];
  available: TagOption[];
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [pending, startTransition] = useTransition();
  const selectedIds = new Set(selected.map((tag) => tag.id));
  const trimmed = search.normalize("NFC").trim();
  const exists = available.some(
    (tag) => tag.name.toLocaleLowerCase("vi") === trimmed.toLocaleLowerCase("vi"),
  );

  const add = (tag: { id: string } | { name: string }) =>
    startTransition(async () => {
      const result = await addTagAction(characterId, tag);
      if (!result.ok) {
        toast.error(result.error.fieldErrors?.tag ?? result.error.message);
        return;
      }
      setSearch("");
      setOpen(false);
    });

  const remove = (tag: TagOption) =>
    startTransition(async () => {
      const result = await removeTagAction(characterId, tag.id);
      if (!result.ok) toast.error(result.error.message);
    });

  return (
    <div className="space-y-3">
      {selected.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t.none}</p>
      ) : (
        <ul className="flex flex-wrap gap-1.5" aria-label={t.title}>
          {selected.map((tag) => (
            <li key={tag.id}>
              <Badge variant="secondary" className="h-6 gap-1 pr-1">
                {tag.name}
                <button
                  type="button"
                  onClick={() => remove(tag)}
                  disabled={pending}
                  aria-label={t.removeTag(tag.name)}
                  className="rounded-full p-0.5 text-muted-foreground outline-none hover:bg-foreground/10 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <X className="size-3" aria-hidden />
                </button>
              </Badge>
            </li>
          ))}
        </ul>
      )}

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" disabled={pending}>
            <Tag data-icon="inline-start" aria-hidden />
            {t.add}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-64 p-0" align="start">
          <Command>
            <CommandInput placeholder={t.searchOrCreate} value={search} onValueChange={setSearch} />
            <CommandList>
              <CommandEmpty>{trimmed ? null : t.empty}</CommandEmpty>
              {available.length > 0 && (
                <CommandGroup>
                  {available.map((tag) => {
                    const isSelected = selectedIds.has(tag.id);
                    return (
                      <CommandItem
                        key={tag.id}
                        value={tag.name}
                        disabled={isSelected || pending}
                        onSelect={() => add({ id: tag.id })}
                      >
                        <Check className={isSelected ? "opacity-100" : "opacity-0"} aria-hidden />
                        {tag.name}
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              )}
              {trimmed && !exists && (
                <CommandGroup forceMount>
                  <CommandItem
                    value={`__create__${trimmed}`}
                    forceMount
                    disabled={pending}
                    onSelect={() => add({ name: trimmed })}
                  >
                    <Plus aria-hidden />
                    {t.createNamed(trimmed)}
                  </CommandItem>
                </CommandGroup>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}
