"use client";

import { Archive, Pencil, Plus, Shapes, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { LibraryDefinitions, LibraryFieldDefinition } from "@/features/characters/domain";
import {
  breakingChangesOf,
  type DefinitionDraft,
  definitionToDraft,
  draftToDefinition,
  emptyDefinitionDraft,
  validateLibraryDefinition,
} from "@/features/characters/editor/custom-fields";
import { placementGroups } from "@/features/characters/editor/group-options";
import { newLibraryFieldKey } from "@/features/characters/editor/ids";
import { buildEditorGroups } from "@/features/characters/editor/layout";
import {
  createLibraryFieldAction,
  createLibraryGroupAction,
  deleteLibraryFieldAction,
  deprecateLibraryFieldAction,
  updateLibraryFieldAction,
} from "@/features/characters/library-field-actions";
import { messages } from "@/i18n";

import { breakingMessage, GroupDialog, locksFor } from "./editor/custom-fields-panel";
import { DefinitionDialog, type DefinitionSubmitResult } from "./editor/definition-dialog";

const t = messages.libraryFields;
const td = messages.editor.definition;

export type LibraryFieldRow = {
  definition: LibraryFieldDefinition;
  status: "active" | "deprecated";
  usage: number;
};

type DialogState =
  { type: "create" } | { type: "edit"; row: LibraryFieldRow } | { type: "group" } | null;

/** Library-scoped field definitions: create, compatible edits, deprecate, delete if unused. */
export function LibraryFieldsManager({
  rows,
  library,
}: {
  rows: LibraryFieldRow[];
  library: LibraryDefinitions;
}) {
  const [dialog, setDialog] = useState<DialogState>(null);
  const groups = buildEditorGroups({
    custom: undefined,
    library,
    deprecatedLibraryKeys: new Set(
      rows.filter((row) => row.status === "deprecated").map((row) => row.definition.key),
    ),
  });
  const groupOptions = () =>
    placementGroups(groups, "library").map((group) => ({ id: group.id, label: group.label }));
  const groupLabel = new Map(groupOptions().map((group) => [group.id, group.label]));

  const create = async (draft: DefinitionDraft): Promise<DefinitionSubmitResult> => {
    const definition = {
      ...draftToDefinition(draft, newLibraryFieldKey()),
      version: 1,
    } as LibraryFieldDefinition;
    const errors = validateLibraryDefinition(library, definition);
    if (Object.keys(errors).length > 0) return { ok: false, errors };
    const result = await createLibraryFieldAction(definition);
    if (!result.ok) return { ok: false, errors: { form: result.error.message } };
    toast.success(t.created);
    return { ok: true };
  };

  const update = async (
    draft: DefinitionDraft,
    previous: LibraryFieldDefinition,
  ): Promise<DefinitionSubmitResult> => {
    const definition = {
      ...draftToDefinition(draft, previous.key),
      version: previous.version,
    } as LibraryFieldDefinition;
    const errors = validateLibraryDefinition(library, definition);
    // Library definitions only accept compatible edits, used or not (keys are never reused).
    const breaking = breakingChangesOf(previous, definition);
    if (breaking.length > 0) errors.form ??= breakingMessage(breaking.map((c) => c.reason));
    if (Object.keys(errors).length > 0) return { ok: false, errors };
    const result = await updateLibraryFieldAction(previous.key, previous.version, definition);
    if (!result.ok) return { ok: false, errors: { form: result.error.message } };
    toast.success(t.updated);
    return { ok: true };
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={() => setDialog({ type: "create" })}>
          <Plus data-icon="inline-start" aria-hidden />
          {t.create}
        </Button>
        <Button type="button" variant="outline" onClick={() => setDialog({ type: "group" })}>
          {t.createGroup}
        </Button>
      </div>

      {rows.length === 0 ? (
        <EmptyState icon={Shapes} title={t.emptyTitle} description={t.emptyBody} />
      ) : (
        <ul className="divide-y rounded-xl border bg-card">
          {rows.map((row) => {
            const { definition } = row;
            const deprecated = row.status === "deprecated";
            return (
              <li key={definition.key} className="flex flex-wrap items-center gap-3 p-4">
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium break-words">{definition.label}</p>
                    <Badge variant={deprecated ? "outline" : "secondary"}>
                      {t.status[row.status]}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {messages.editor.kinds[definition.kind]} ·{" "}
                    {t.inGroup(groupLabel.get(definition.group) ?? definition.group)} ·{" "}
                    {t.version(definition.version)} · {t.usage(row.usage)}
                  </p>
                  {definition.description && (
                    <p className="text-sm text-muted-foreground">{definition.description}</p>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={t.edit(definition.label)}
                    onClick={() => setDialog({ type: "edit", row })}
                  >
                    <Pencil aria-hidden />
                  </Button>
                  {!deprecated && (
                    <ConfirmDialog
                      trigger={
                        <Button type="button" variant="ghost" size="sm">
                          <Archive data-icon="inline-start" aria-hidden />
                          {t.deprecate}
                        </Button>
                      }
                      title={t.deprecateTitle(definition.label)}
                      description={t.deprecateBody}
                      confirmLabel={t.deprecate}
                      pendingLabel={messages.common.saving}
                      onConfirm={async () => {
                        const result = await deprecateLibraryFieldAction(definition.key);
                        if (!result.ok) toast.error(result.error.message);
                        else toast.success(t.deprecated);
                        return result.ok;
                      }}
                    />
                  )}
                  {!deprecated &&
                    (row.usage > 0 ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        disabled
                        aria-label={t.delete(definition.label)}
                        title={t.deleteInUse}
                      >
                        <Trash2 aria-hidden />
                      </Button>
                    ) : (
                      <ConfirmDialog
                        trigger={
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            aria-label={t.delete(definition.label)}
                          >
                            <Trash2 aria-hidden className="text-muted-foreground" />
                          </Button>
                        }
                        title={t.deleteTitle(definition.label)}
                        description={t.deleteBody}
                        confirmLabel={messages.common.delete}
                        onConfirm={async () => {
                          const result = await deleteLibraryFieldAction(definition.key);
                          if (!result.ok) toast.error(result.error.message);
                          else toast.success(t.deleted);
                          return result.ok;
                        }}
                      />
                    ))}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <section aria-labelledby="library-groups-title" className="space-y-2">
        <h2 id="library-groups-title" className="font-heading text-lg font-semibold">
          {t.groupsTitle}
        </h2>
        {library.groups.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t.groupsEmpty}</p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {library.groups.map((group) => (
              <li key={group.id}>
                <Badge variant="secondary">{groupLabel.get(group.id) ?? group.label}</Badge>
              </li>
            ))}
          </ul>
        )}
      </section>

      {dialog?.type === "create" && (
        <DefinitionDialog
          open
          onOpenChange={(open) => !open && setDialog(null)}
          title={t.create}
          initial={emptyDefinitionDraft(groupOptions()[0]?.id ?? "identity")}
          scopes={["library"]}
          initialScope="library"
          groupOptions={groupOptions}
          submitLabel={td.submitCreate}
          onSubmit={(draft) => create(draft)}
        />
      )}
      {dialog?.type === "edit" && (
        <DefinitionDialog
          open
          onOpenChange={(open) => !open && setDialog(null)}
          title={t.edit(dialog.row.definition.label)}
          initial={definitionToDraft(dialog.row.definition)}
          scopes={["library"]}
          initialScope="library"
          groupOptions={groupOptions}
          locks={locksFor(dialog.row.definition, true)}
          notice={dialog.row.usage > 0 ? td.inUse(dialog.row.usage) : undefined}
          submitLabel={td.submitSave}
          onSubmit={(draft) => update(draft, dialog.row.definition)}
        />
      )}
      {dialog?.type === "group" && (
        <GroupDialog
          open
          onOpenChange={(open) => !open && setDialog(null)}
          title={t.createGroup}
          initialLabel=""
          parents={groups
            .filter((group) => group.scope !== "character")
            .map((group) => ({ id: group.id, label: group.label }))}
          onSubmit={async (label, parent) => {
            const result = await createLibraryGroupAction({ label, ...(parent ? { parent } : {}) });
            if (!result.ok) return result.error.fieldErrors?.label ?? result.error.message;
            toast.success(t.groupCreated);
            return null;
          }}
        />
      )}
    </div>
  );
}
