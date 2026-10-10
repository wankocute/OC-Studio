"use client";

import { ArrowDown, ArrowUp, ExternalLink, Pencil, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { type Dispatch, useId, useState, useTransition } from "react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";
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
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  type CustomFieldDefinition,
  type FieldScope,
  LIMITS,
  type LibraryFieldDefinition,
} from "@/features/characters/domain";
import {
  addCustomGroup,
  breakingChangesOf,
  canRemoveCustomGroup,
  type DefinitionDraft,
  type DefinitionErrors,
  definitionToDraft,
  draftToDefinition,
  emptyDefinitionDraft,
  moveCustomField,
  moveCustomGroup,
  removeCustomField,
  removeCustomGroup,
  renameCustomGroup,
  upsertCustomField,
  validateCustomDefinition,
  validateLibraryDefinition,
} from "@/features/characters/editor/custom-fields";
import type { EditorAction, EditorState } from "@/features/characters/editor/editor-state";
import { placementGroups } from "@/features/characters/editor/group-options";
import {
  newCustomFieldKey,
  newCustomGroupId,
  newLibraryFieldKey,
} from "@/features/characters/editor/ids";
import type { EditorGroup } from "@/features/characters/editor/layout";
import { createLibraryFieldAction } from "@/features/characters/library-field-actions";
import { messages } from "@/i18n";

import {
  DefinitionDialog,
  type DefinitionLocks,
  type DefinitionSubmitResult,
} from "./definition-dialog";
import { FieldMessage } from "./field-message";

const t = messages.editor.custom;
const td = messages.editor.definition;
const UNSET = "__top";

type Scope = Exclude<FieldScope, "builtin">;

/** Explain breaking changes in plain words. */
export function breakingMessage(reasons: readonly string[]): string {
  const unique = [...new Set(reasons)].map((reason) => td.breakingReasons[reason] ?? reason);
  return `${td.breaking} ${unique.join(", ")}.`;
}

/** Locks for editing a definition that already has stored values. */
export function locksFor(
  definition: CustomFieldDefinition | LibraryFieldDefinition,
  inUse: boolean,
): DefinitionLocks | undefined {
  if (!inUse) return undefined;
  const options = "options" in definition ? definition.options.map((option) => option.code) : [];
  const subfields = "fields" in definition ? definition.fields : [];
  return {
    kind: true,
    optionCodes: new Set([
      ...options,
      ...subfields.flatMap((subfield) =>
        "options" in subfield ? subfield.options.map((option) => option.code) : [],
      ),
    ]),
    subfieldKeys: new Set(subfields.map((subfield) => subfield.key)),
    units: new Set([
      ...("units" in definition ? definition.units : []),
      ...subfields.flatMap((subfield) => ("units" in subfield ? subfield.units : [])),
    ]),
  };
}

export function GroupDialog({
  open,
  onOpenChange,
  title,
  initialLabel,
  parents,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  initialLabel: string;
  /** Possible parents; omitted when renaming. */
  parents?: { id: string; label: string }[];
  /** Returns an error message, or null on success. */
  onSubmit: (label: string, parent: string | undefined) => string | null | Promise<string | null>;
}) {
  const prefix = useId();
  const [pending, startTransition] = useTransition();
  const [label, setLabel] = useState(initialLabel);
  const [parent, setParent] = useState(UNSET);
  const [error, setError] = useState<string | null>(null);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form
          noValidate
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            startTransition(async () => {
              const message = await onSubmit(label, parent === UNSET ? undefined : parent);
              if (message) setError(message);
              else onOpenChange(false);
            });
          }}
        >
          <DialogHeader>
            <DialogTitle className="font-heading text-xl">{title}</DialogTitle>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor={`${prefix}-label`}>{t.groupLabel}</Label>
            <Input
              id={`${prefix}-label`}
              value={label}
              autoFocus
              aria-invalid={Boolean(error) || undefined}
              onChange={(event) => setLabel(event.target.value)}
            />
            <FieldMessage message={error ?? undefined} />
          </div>
          {parents && (
            <div className="space-y-1.5">
              <Label htmlFor={`${prefix}-parent`}>{t.groupParent}</Label>
              <Select value={parent} onValueChange={setParent}>
                <SelectTrigger id={`${prefix}-parent`} className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={UNSET}>{t.groupParentNone}</SelectItem>
                  {parents.map((option) => (
                    <SelectItem key={option.id} value={option.id}>
                      {t.groupParentInside(option.label)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {messages.common.cancel}
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? messages.common.saving : messages.common.save}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

type DialogState =
  | { type: "createField"; scope: Scope }
  | { type: "editField"; definition: CustomFieldDefinition }
  | { type: "addGroup" }
  | { type: "renameGroup"; id: string; label: string }
  | null;

export function CustomFieldsPanel({
  state,
  groups,
  dispatch,
  onOpenGroup,
}: {
  state: EditorState;
  groups: EditorGroup[];
  dispatch: Dispatch<EditorAction>;
  onOpenGroup: (groupId: string) => void;
}) {
  const titleId = useId();
  const [dialog, setDialog] = useState<DialogState>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const { working, library } = state;
  const customGroups = working.custom?.groups ?? [];
  const customFields = working.custom?.fields ?? [];
  const deprecated = new Set(state.deprecatedLibraryKeys);
  const groupLabel = new Map(
    placementGroups(groups, "character").map((group) => [group.id, group.label]),
  );
  const usedLibrary = library.fields.filter(
    (field) =>
      working.values[field.key] !== undefined || state.addedLibraryKeys.includes(field.key),
  );
  const availableLibrary = library.fields.filter(
    (field) => !deprecated.has(field.key) && !usedLibrary.includes(field),
  );
  const topLevelParents = groups.map((group) => ({ id: group.id, label: group.label }));

  const groupOptions = (scope: Scope) =>
    placementGroups(groups, scope).map((group) => ({ id: group.id, label: group.label }));

  const submitCharacterField = (
    draft: DefinitionDraft,
    previous: CustomFieldDefinition | undefined,
  ): DefinitionSubmitResult => {
    const definition = draftToDefinition(draft, previous?.key ?? newCustomFieldKey());
    const errors: DefinitionErrors = validateCustomDefinition(working, definition, library);
    if (previous && working.values[previous.key] !== undefined) {
      const breaking = breakingChangesOf(previous, definition);
      if (breaking.length > 0) errors.form ??= breakingMessage(breaking.map((c) => c.reason));
    }
    if (Object.keys(errors).length > 0) return { ok: false, errors };
    dispatch({ type: "updateFacts", update: (facts) => upsertCustomField(facts, definition) });
    toast.success(previous ? t.fieldUpdated : t.fieldAdded);
    return { ok: true };
  };

  const submitLibraryField = async (draft: DefinitionDraft): Promise<DefinitionSubmitResult> => {
    const definition = {
      ...draftToDefinition(draft, newLibraryFieldKey()),
      version: 1,
    } as LibraryFieldDefinition;
    const errors = validateLibraryDefinition(library, definition);
    if (Object.keys(errors).length > 0) return { ok: false, errors };
    const result = await createLibraryFieldAction(definition, false);
    if (!result.ok) return { ok: false, errors: { form: result.error.message } };
    dispatch({ type: "addLibraryDefinition", definition: result.data });
    dispatch({ type: "showLibraryField", key: result.data.key });
    toast.success(t.libraryAdded(result.data.label));
    return { ok: true };
  };

  const addGroup = (label: string, parent: string | undefined): string | null => {
    const clean = label.normalize("NFC").trim();
    if (!clean) return messages.editor.validation.required;
    if (clean.length > LIMITS.shortText)
      return messages.characters.validation.tooLong(LIMITS.shortText);
    dispatch({
      type: "updateFacts",
      update: (facts) =>
        addCustomGroup(facts, {
          id: newCustomGroupId(),
          label: clean,
          ...(parent ? { parent } : {}),
        }),
    });
    toast.success(t.groupAdded);
    return null;
  };

  return (
    <section aria-labelledby={titleId} className="space-y-6">
      <div className="space-y-1">
        <h2 id={titleId} className="font-heading text-2xl font-semibold tracking-tight">
          {messages.editor.nav.custom}
        </h2>
        <p className="text-sm text-muted-foreground">{t.description}</p>
      </div>

      <div className="space-y-3 rounded-xl border bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-medium">{t.characterFields}</h3>
          <Button
            type="button"
            size="sm"
            onClick={() => setDialog({ type: "createField", scope: "character" })}
          >
            <Plus data-icon="inline-start" aria-hidden />
            {t.addField}
          </Button>
        </div>
        {customFields.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t.noFields}</p>
        ) : (
          <ul className="divide-y">
            {customFields.map((field) => {
              const hasValue = working.values[field.key] !== undefined;
              const sameGroup = customFields.filter((other) => other.group === field.group);
              const position = sameGroup.indexOf(field);
              return (
                <li key={field.key} className="flex flex-wrap items-center gap-2 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium break-words">{field.label}</p>
                    <p className="text-xs text-muted-foreground">
                      {messages.editor.kinds[field.kind]} ·{" "}
                      {t.inGroup(groupLabel.get(field.group) ?? field.group)}
                    </p>
                  </div>
                  {hasValue && <Badge variant="secondary">{t.hasValue}</Badge>}
                  <div className="flex items-center">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={t.moveUp(field.label)}
                      disabled={position === 0}
                      onClick={() =>
                        dispatch({
                          type: "updateFacts",
                          update: (facts) => moveCustomField(facts, field.key, -1),
                        })
                      }
                    >
                      <ArrowUp aria-hidden />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={t.moveDown(field.label)}
                      disabled={position === sameGroup.length - 1}
                      onClick={() =>
                        dispatch({
                          type: "updateFacts",
                          update: (facts) => moveCustomField(facts, field.key, 1),
                        })
                      }
                    >
                      <ArrowDown aria-hidden />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={t.editField(field.label)}
                      onClick={() => setDialog({ type: "editField", definition: field })}
                    >
                      <Pencil aria-hidden />
                    </Button>
                    <ConfirmDialog
                      trigger={
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          aria-label={t.removeField(field.label)}
                        >
                          <Trash2 aria-hidden className="text-muted-foreground" />
                        </Button>
                      }
                      title={t.removeFieldTitle(field.label)}
                      description={t.removeFieldBody}
                      confirmLabel={t.removeFieldConfirm}
                      onConfirm={async () => {
                        dispatch({
                          type: "updateFacts",
                          update: (facts) => removeCustomField(facts, field.key),
                        });
                        return true;
                      }}
                    />
                    <Button
                      type="button"
                      variant="link"
                      size="sm"
                      onClick={() => onOpenGroup(field.group)}
                    >
                      {t.openGroup}
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="space-y-3 rounded-xl border bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-medium">{t.characterGroups}</h3>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setDialog({ type: "addGroup" })}
          >
            <Plus data-icon="inline-start" aria-hidden />
            {t.addGroup}
          </Button>
        </div>
        {customGroups.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t.noGroups}</p>
        ) : (
          <ul className="divide-y">
            {customGroups.map((group, index) => {
              const removable = canRemoveCustomGroup(working, library, group.id);
              return (
                <li key={group.id} className="flex flex-wrap items-center gap-2 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium break-words">{group.label}</p>
                    {group.parent && (
                      <p className="text-xs text-muted-foreground">
                        {t.groupParentInside(groupLabel.get(group.parent) ?? group.parent)}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={t.moveUp(group.label)}
                      disabled={index === 0}
                      onClick={() =>
                        dispatch({
                          type: "updateFacts",
                          update: (facts) => moveCustomGroup(facts, group.id, -1),
                        })
                      }
                    >
                      <ArrowUp aria-hidden />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={t.moveDown(group.label)}
                      disabled={index === customGroups.length - 1}
                      onClick={() =>
                        dispatch({
                          type: "updateFacts",
                          update: (facts) => moveCustomGroup(facts, group.id, 1),
                        })
                      }
                    >
                      <ArrowDown aria-hidden />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={t.renameGroup(group.label)}
                      onClick={() =>
                        setDialog({ type: "renameGroup", id: group.id, label: group.label })
                      }
                    >
                      <Pencil aria-hidden />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={t.removeGroup(group.label)}
                      title={removable ? undefined : t.groupInUse}
                      disabled={!removable}
                      onClick={() =>
                        dispatch({
                          type: "updateFacts",
                          update: (facts) => removeCustomGroup(facts, group.id),
                        })
                      }
                    >
                      <Trash2 aria-hidden className="text-muted-foreground" />
                    </Button>
                    <Button
                      type="button"
                      variant="link"
                      size="sm"
                      onClick={() => onOpenGroup(group.id)}
                    >
                      {t.openGroup}
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="space-y-3 rounded-xl border bg-card p-4">
        <div className="space-y-1">
          <h3 className="font-medium">{t.libraryFields}</h3>
          <p className="text-sm text-muted-foreground">{t.libraryFieldsHint}</p>
        </div>
        {usedLibrary.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t.noLibraryFields}</p>
        ) : (
          <ul className="divide-y">
            {usedLibrary.map((field) => (
              <li key={field.key} className="flex flex-wrap items-center gap-2 py-2">
                <div className="min-w-0 flex-1">
                  <p className="font-medium break-words">{field.label}</p>
                  <p className="text-xs text-muted-foreground">
                    {messages.editor.kinds[field.kind]} ·{" "}
                    {t.inGroup(groupLabel.get(field.group) ?? field.group)}
                  </p>
                </div>
                {deprecated.has(field.key) && (
                  <Badge variant="outline">{messages.editor.badges.deprecated}</Badge>
                )}
                {working.values[field.key] !== undefined && (
                  <Badge variant="secondary">{t.hasValue}</Badge>
                )}
                <Button
                  type="button"
                  variant="link"
                  size="sm"
                  onClick={() => onOpenGroup(field.group)}
                >
                  {t.openGroup}
                </Button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex flex-wrap gap-2">
          <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
            <PopoverTrigger asChild>
              <Button type="button" variant="outline" size="sm">
                <Plus data-icon="inline-start" aria-hidden />
                {t.useLibraryField}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-72 p-0" align="start">
              <Command>
                <CommandInput placeholder={t.searchLibrary} />
                <CommandList>
                  <CommandEmpty>{t.noAvailableLibrary}</CommandEmpty>
                  {availableLibrary.length > 0 && (
                    <CommandGroup>
                      {availableLibrary.map((field) => (
                        <CommandItem
                          key={field.key}
                          value={`${field.label} ${field.key}`}
                          onSelect={() => {
                            dispatch({ type: "showLibraryField", key: field.key });
                            setPickerOpen(false);
                            toast.success(t.libraryAdded(field.label));
                            onOpenGroup(field.group);
                          }}
                        >
                          {field.label}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  )}
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setDialog({ type: "createField", scope: "library" })}
          >
            {t.createLibraryField}
          </Button>
          <Button asChild variant="link" size="sm">
            <Link href="/fields">
              {t.manageLibrary}
              <ExternalLink data-icon="inline-end" aria-hidden />
            </Link>
          </Button>
        </div>
      </div>

      {dialog?.type === "createField" && (
        <DefinitionDialog
          open
          onOpenChange={(open) => !open && setDialog(null)}
          title={td.createTitle}
          initial={emptyDefinitionDraft(groupOptions("character")[0]?.id ?? "identity")}
          scopes={["character", "library"]}
          initialScope={dialog.scope}
          groupOptions={groupOptions}
          submitLabel={td.submitCreate}
          onSubmit={async (draft, scope) =>
            scope === "library" ? submitLibraryField(draft) : submitCharacterField(draft, undefined)
          }
        />
      )}
      {dialog?.type === "editField" && (
        <DefinitionDialog
          open
          onOpenChange={(open) => !open && setDialog(null)}
          title={td.editTitle}
          initial={definitionToDraft(dialog.definition)}
          scopes={["character"]}
          initialScope="character"
          groupOptions={groupOptions}
          locks={locksFor(dialog.definition, working.values[dialog.definition.key] !== undefined)}
          notice={
            working.values[dialog.definition.key] !== undefined ? td.hasValueNotice : undefined
          }
          submitLabel={td.submitSave}
          onSubmit={async (draft) => submitCharacterField(draft, dialog.definition)}
        />
      )}
      {dialog?.type === "addGroup" && (
        <GroupDialog
          open
          onOpenChange={(open) => !open && setDialog(null)}
          title={t.addGroup}
          initialLabel=""
          parents={topLevelParents}
          onSubmit={addGroup}
        />
      )}
      {dialog?.type === "renameGroup" && (
        <GroupDialog
          open
          onOpenChange={(open) => !open && setDialog(null)}
          title={t.renameGroup(dialog.label)}
          initialLabel={dialog.label}
          onSubmit={(label) => {
            const clean = label.normalize("NFC").trim();
            if (!clean) return messages.editor.validation.required;
            dispatch({
              type: "updateFacts",
              update: (facts) => renameCustomGroup(facts, dialog.id, clean),
            });
            return null;
          }}
        />
      )}
    </section>
  );
}
