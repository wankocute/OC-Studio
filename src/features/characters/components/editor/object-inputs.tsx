"use client";

import { ChevronDown } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import type { SubfieldDefinition } from "@/features/characters/domain";
import {
  emptyObjectItem,
  type LeafDraft,
  type ObjectItemDraft,
  type ValueDraft,
} from "@/features/characters/editor/drafts";
import { errorKeys } from "@/features/characters/editor/errors";
import { newItemId } from "@/features/characters/editor/ids";
import { subfieldLabel } from "@/features/characters/editor/layout";
import { messages } from "@/i18n";
import { cn } from "@/lib/utils";

import { useEditorContext } from "./editor-context";
import { FieldMessage } from "./field-message";
import { hasSingleControl, LeafInput } from "./leaf-input";
import { AddItemButton, ItemControls, moveItem } from "./list-inputs";

const t = messages.editor;

/** Wide controls take the full row of the two-column sub-field grid. */
const WIDE_KINDS = new Set([
  "long_text",
  "text_list",
  "character_ref_list",
  "multi_select",
  "date",
]);

/** The sub-fields of one object value / list item. */
function ObjectFields({
  id,
  fieldKey,
  fields,
  values,
  itemId,
  onChange,
}: {
  id: string;
  fieldKey: string;
  fields: readonly SubfieldDefinition[];
  values: Record<string, LeafDraft>;
  itemId?: string;
  onChange: (values: Record<string, LeafDraft>) => void;
}) {
  const { errors } = useEditorContext();
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {fields.map((subfield) => {
        const subId = `${id}-${subfield.key}`;
        const label = subfieldLabel(fieldKey, subfield);
        const error = errors[errorKeys.subfield(fieldKey, subfield.key, itemId)];
        const errorId = `${subId}-error`;
        const single = hasSingleControl(subfield.kind);
        const labelId = `${subId}-label`;
        return (
          <div
            key={subfield.key}
            role={single ? undefined : "group"}
            aria-labelledby={single ? undefined : labelId}
            className={cn("min-w-0 space-y-1.5", WIDE_KINDS.has(subfield.kind) && "sm:col-span-2")}
          >
            <div className="flex flex-wrap items-center gap-2">
              <Label id={labelId} htmlFor={single ? subId : undefined}>
                {label}
                {subfield.required && (
                  <span className="text-destructive" aria-hidden>
                    *
                  </span>
                )}
              </Label>
            </div>
            <LeafInput
              config={subfield}
              draft={values[subfield.key]!}
              onChange={(draft) => onChange({ ...values, [subfield.key]: draft })}
              id={subId}
              label={label}
              fieldKey={fieldKey}
              optionPath={`${fieldKey}.${subfield.key}`}
              error={error}
              describedBy={error ? errorId : undefined}
            />
            <FieldMessage id={errorId} message={error} />
          </div>
        );
      })}
    </div>
  );
}

export function ObjectInput({
  id,
  fieldKey,
  fields,
  draft,
  onChange,
}: {
  id: string;
  fieldKey: string;
  fields: readonly SubfieldDefinition[];
  draft: Extract<ValueDraft, { kind: "object" }>;
  onChange: (draft: Extract<ValueDraft, { kind: "object" }>) => void;
}) {
  return (
    <ObjectFields
      id={id}
      fieldKey={fieldKey}
      fields={fields}
      values={draft.fields}
      onChange={(values) => onChange({ ...draft, fields: values })}
    />
  );
}

/** Text shown in an item's header: its first text sub-field. */
function itemTitle(
  fields: readonly SubfieldDefinition[],
  item: ObjectItemDraft,
): string | undefined {
  for (const subfield of fields) {
    const value = item.fields[subfield.key];
    if ((value?.kind === "short_text" || value?.kind === "long_text") && value.text.trim()) {
      return value.text.trim();
    }
  }
  return undefined;
}

export function ObjectListInput({
  id,
  label,
  fieldKey,
  fields,
  draft,
  onChange,
}: {
  id: string;
  label: string;
  fieldKey: string;
  fields: readonly SubfieldDefinition[];
  draft: Extract<ValueDraft, { kind: "object_list" }>;
  onChange: (draft: Extract<ValueDraft, { kind: "object_list" }>) => void;
}) {
  const { errors } = useEditorContext();
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());

  const toggle = (itemId: string) =>
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });

  return (
    <div id={id} className="space-y-3">
      {draft.items.length === 0 && (
        <p className="text-sm text-muted-foreground">{t.inputs.emptyList}</p>
      )}
      {draft.items.length > 0 && (
        <ol className="space-y-3">
          {draft.items.map((item, index) => {
            const title = itemTitle(fields, item);
            const itemLabel = title ?? t.inputs.itemLabel(label, index + 1);
            const isCollapsed = collapsed.has(item.id);
            const bodyId = `${id}-${item.id}-body`;
            const error = errors[errorKeys.item(fieldKey, item.id)];
            return (
              <li key={item.id} className="rounded-lg border border-border/80 bg-background/60">
                <div className="flex items-center gap-1 border-b border-border/60 py-1 pr-1 pl-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="min-w-0 flex-1 justify-start"
                    aria-expanded={!isCollapsed}
                    aria-controls={bodyId}
                    aria-label={
                      isCollapsed
                        ? t.inputs.expandItem(itemLabel)
                        : t.inputs.collapseItem(itemLabel)
                    }
                    onClick={() => toggle(item.id)}
                  >
                    <ChevronDown
                      aria-hidden
                      className={cn("transition-transform", isCollapsed && "-rotate-90")}
                    />
                    <span className="truncate">
                      <span className="text-muted-foreground">{index + 1}. </span>
                      {title ?? (
                        <span className="text-muted-foreground italic">
                          {t.inputs.untitledItem}
                        </span>
                      )}
                    </span>
                  </Button>
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
                <div id={bodyId} hidden={isCollapsed} className="space-y-2 p-3">
                  <ObjectFields
                    id={`${id}-${item.id}`}
                    fieldKey={fieldKey}
                    fields={fields}
                    values={item.fields}
                    itemId={item.id}
                    onChange={(values) =>
                      onChange({
                        ...draft,
                        items: draft.items.map((other) =>
                          other.id === item.id ? { ...other, fields: values } : other,
                        ),
                      })
                    }
                  />
                  <FieldMessage message={error} />
                </div>
              </li>
            );
          })}
        </ol>
      )}
      <AddItemButton
        onClick={() =>
          onChange({ ...draft, items: [...draft.items, emptyObjectItem({ fields }, newItemId())] })
        }
      />
    </div>
  );
}
