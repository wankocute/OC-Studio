"use client";

import { Link2, Plus, UserRound, UserRoundPlus, X } from "lucide-react";
import { type ReactNode, useState } from "react";

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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import type { LeafDraft, RefDraft } from "@/features/characters/editor/drafts";
import { errorKeys } from "@/features/characters/editor/errors";
import { newItemId } from "@/features/characters/editor/ids";
import { messages } from "@/i18n";
import { formatDateTime } from "@/lib/format";

import { useEditorContext } from "./editor-context";
import { FieldMessage } from "./field-message";
import { ItemControls, moveItem } from "./list-inputs";

const t = messages.editor.refs;
const ti = messages.editor.inputs;

const sameName = (a: string, b: string) =>
  a.normalize("NFC").trim().toLocaleLowerCase("vi") ===
  b.normalize("NFC").trim().toLocaleLowerCase("vi");

/**
 * Choose a library character, or name a character that has no profile. Characters already in the
 * list (`exclude`) and the edited character itself are not offered.
 */
function CharacterPicker({
  trigger,
  exclude = [],
  onSelect,
}: {
  trigger: ReactNode;
  exclude?: readonly string[];
  onSelect: (ref: RefDraft) => void;
}) {
  const { characters, characterId } = useEditorContext();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const trimmed = search.normalize("NFC").trim();
  const options = characters.filter(
    (character) => character.id !== characterId && !exclude.includes(character.id),
  );

  const choose = (ref: RefDraft) => {
    onSelect(ref);
    setSearch("");
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="start">
        <Command>
          <CommandInput placeholder={t.search} value={search} onValueChange={setSearch} />
          <CommandList>
            <CommandEmpty>{trimmed ? t.noCharacters : t.typeToAdd}</CommandEmpty>
            {options.length > 0 && (
              <CommandGroup heading={t.inLibrary}>
                {options.map((character) => (
                  <CommandItem
                    key={character.id}
                    value={`${character.displayName} ${character.id}`}
                    onSelect={() => choose({ type: "character", characterId: character.id })}
                  >
                    <UserRound aria-hidden />
                    {character.displayName}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {trimmed && (
              <CommandGroup forceMount>
                <CommandItem
                  value={`__unlinked__${trimmed}`}
                  forceMount
                  onSelect={() => choose({ type: "unlinked", name: trimmed, note: "" })}
                >
                  <UserRoundPlus aria-hidden />
                  {t.unlinkedOption(trimmed)}
                </CommandItem>
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

/** One reference: a linked OC (read-only name) or an unlinked character (editable name/note). */
function RefEditor({
  id,
  refDraft,
  onChange,
  error,
}: {
  id: string;
  refDraft: RefDraft;
  onChange: (ref: RefDraft) => void;
  error?: string;
}) {
  const { nameOf, characters } = useEditorContext();

  if (refDraft.type === "character") {
    const name = nameOf(refDraft.characterId);
    return (
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <Link2 className="size-4 shrink-0 text-primary" aria-hidden />
        <span className="min-w-0 font-medium break-words">{name ?? t.missing}</span>
        <Badge variant="secondary">{t.linked}</Badge>
      </div>
    );
  }

  const twin = characters.find((character) => sameName(character.displayName, refDraft.name));
  return (
    <div className="min-w-0 flex-1 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline">{t.unlinked}</Badge>
        {refDraft.detachedFrom && (
          <Badge variant="outline" className="border-warning/40 text-warning">
            {t.detached}
          </Badge>
        )}
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor={`${id}-name`} className="text-xs text-muted-foreground">
            {t.unlinkedName}
          </Label>
          <Input
            id={`${id}-name`}
            value={refDraft.name}
            aria-invalid={Boolean(error) || undefined}
            onChange={(event) => onChange({ ...refDraft, name: event.target.value })}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`${id}-note`} className="text-xs text-muted-foreground">
            {t.note}
          </Label>
          <Textarea
            id={`${id}-note`}
            rows={1}
            className="min-h-8"
            value={refDraft.note}
            onChange={(event) => onChange({ ...refDraft, note: event.target.value })}
          />
        </div>
      </div>
      {refDraft.detachedFrom && (
        <FieldMessage
          tone="hint"
          message={t.detachedHint(formatDateTime(new Date(refDraft.detachedFrom.at)))}
        />
      )}
      {twin && <FieldMessage tone="hint" message={t.sameNameHint} />}
    </div>
  );
}

export function CharacterRefInput({
  id,
  label,
  draft,
  onChange,
  error,
}: {
  id: string;
  label: string;
  draft: Extract<LeafDraft, { kind: "character_ref" }>;
  onChange: (draft: Extract<LeafDraft, { kind: "character_ref" }>) => void;
  error?: string;
}) {
  const choose = (ref: RefDraft) => onChange({ ...draft, ref });
  if (!draft.ref) {
    return (
      <CharacterPicker
        onSelect={choose}
        trigger={
          <Button
            id={id}
            type="button"
            variant="outline"
            size="sm"
            aria-label={`${label}: ${t.choose}`}
          >
            <UserRound data-icon="inline-start" aria-hidden />
            {t.choose}
          </Button>
        }
      />
    );
  }
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border/70 p-3 sm:flex-row sm:items-start">
      <div className="min-w-0 flex-1">
        <RefEditor id={id} refDraft={draft.ref} onChange={choose} error={error} />
      </div>
      <div className="flex shrink-0 gap-1">
        <CharacterPicker
          onSelect={choose}
          trigger={
            <Button type="button" variant="ghost" size="sm" aria-label={`${label}: ${t.change}`}>
              {t.change}
            </Button>
          }
        />
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={`${label}: ${t.remove}`}
          onClick={() => onChange({ ...draft, ref: null })}
        >
          <X aria-hidden />
        </Button>
      </div>
    </div>
  );
}

export function CharacterRefListInput({
  id,
  label,
  fieldKey,
  draft,
  onChange,
}: {
  id: string;
  label: string;
  fieldKey: string;
  draft: Extract<LeafDraft, { kind: "character_ref_list" }>;
  onChange: (draft: Extract<LeafDraft, { kind: "character_ref_list" }>) => void;
}) {
  const { errors, nameOf } = useEditorContext();
  const linked = draft.items.flatMap((item) =>
    item.ref.type === "character" ? [item.ref.characterId] : [],
  );

  return (
    <div id={id} className="space-y-2">
      {draft.items.length > 0 && (
        <ol className="space-y-2">
          {draft.items.map((item, index) => {
            const itemLabel =
              (item.ref.type === "character" ? nameOf(item.ref.characterId) : item.ref.name) ||
              ti.itemLabel(label, index + 1);
            const error = errors[errorKeys.item(fieldKey, item.id)];
            return (
              <li key={item.id} className="space-y-1 rounded-lg border border-border/70 p-2">
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1 py-1">
                    <RefEditor
                      id={`${id}-${item.id}`}
                      refDraft={item.ref}
                      error={error}
                      onChange={(ref) =>
                        onChange({
                          ...draft,
                          items: draft.items.map((other) =>
                            other.id === item.id ? { ...other, ref } : other,
                          ),
                        })
                      }
                    />
                  </div>
                  <ItemControls
                    itemLabel={itemLabel}
                    index={index}
                    count={draft.items.length}
                    onMove={(direction) =>
                      onChange({ ...draft, items: moveItem(draft.items, index, direction) })
                    }
                    onRemove={() =>
                      onChange({
                        ...draft,
                        items: draft.items.filter((other) => other.id !== item.id),
                      })
                    }
                  />
                </div>
                <FieldMessage message={error} />
              </li>
            );
          })}
        </ol>
      )}
      <CharacterPicker
        exclude={linked}
        onSelect={(ref) =>
          onChange({ ...draft, items: [...draft.items, { id: newItemId(), ref }] })
        }
        trigger={
          <Button
            type="button"
            variant="outline"
            size="sm"
            aria-label={`${label}: ${t.addCharacter}`}
          >
            <Plus data-icon="inline-start" aria-hidden />
            {t.addCharacter}
          </Button>
        }
      />
    </div>
  );
}
