"use client";

import { ArrowDown, ArrowUp, Plus, ShieldAlert, Trash2 } from "lucide-react";
import { type ReactNode, useState } from "react";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Toggle } from "@/components/ui/toggle";
import type { LeafDraft } from "@/features/characters/editor/drafts";
import { errorKeys } from "@/features/characters/editor/errors";
import { newItemId } from "@/features/characters/editor/ids";
import { messages } from "@/i18n";
import { cn } from "@/lib/utils";

import { useEditorContext } from "./editor-context";
import { FieldMessage } from "./field-message";

const t = messages.editor.inputs;

/** Per-item sensitivity of a top-level list field (SEN-02). Absent for nested lists. */
export type ItemSensitivity = {
  ids: readonly string[];
  onChange: (ids: string[]) => void;
};

export function moveItem<T>(items: readonly T[], index: number, direction: -1 | 1): T[] {
  const target = index + direction;
  if (target < 0 || target >= items.length) return [...items];
  const next = [...items];
  [next[index], next[target]] = [next[target]!, next[index]!];
  return next;
}

/** Reorder / sensitivity / remove controls of one list item. Ids never change. */
export function ItemControls({
  itemLabel,
  index,
  count,
  onMove,
  onRemove,
  sensitive,
  onSensitiveChange,
}: {
  itemLabel: string;
  index: number;
  count: number;
  onMove: (direction: -1 | 1) => void;
  onRemove: () => void;
  sensitive?: boolean;
  /** Omitted when items cannot be marked individually. */
  onSensitiveChange?: (sensitive: boolean) => void;
}) {
  const removeButton = (
    <Button type="button" variant="ghost" size="icon-sm" aria-label={t.removeItem(itemLabel)}>
      <Trash2 aria-hidden className="text-muted-foreground" />
    </Button>
  );
  return (
    <div className="flex shrink-0 items-center">
      {onSensitiveChange && (
        <Toggle
          size="sm"
          aria-label={t.markSensitive(itemLabel)}
          pressed={sensitive === true}
          onPressedChange={onSensitiveChange}
          className="data-[state=on]:text-warning"
        >
          <ShieldAlert aria-hidden />
        </Toggle>
      )}
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label={t.moveUp(itemLabel)}
        disabled={index === 0}
        onClick={() => onMove(-1)}
      >
        <ArrowUp aria-hidden />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label={t.moveDown(itemLabel)}
        disabled={index === count - 1}
        onClick={() => onMove(1)}
      >
        <ArrowDown aria-hidden />
      </Button>
      {sensitive ? (
        // Removing an item also removes its sensitivity mark: ask first.
        <ConfirmDialog
          trigger={removeButton}
          title={t.removeSensitiveTitle}
          description={t.removeSensitiveBody}
          confirmLabel={t.removeConfirm}
          onConfirm={async () => {
            onRemove();
            return true;
          }}
        />
      ) : (
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={t.removeItem(itemLabel)}
          onClick={onRemove}
        >
          <Trash2 aria-hidden className="text-muted-foreground" />
        </Button>
      )}
    </div>
  );
}

export function SensitiveBadge() {
  return (
    <Badge variant="outline" className="border-warning/40 text-warning">
      <ShieldAlert aria-hidden />
      {t.sensitiveItem}
    </Badge>
  );
}

/**
 * Sensitivity marks shared by list editors. Removing an item needs no bookkeeping here: marks of
 * items that no longer exist are dropped when the fact is built (`draftToFact`).
 */
export function useListSensitivity(sensitivity: ItemSensitivity | undefined) {
  const isSensitive = (id: string) => sensitivity?.ids.includes(id) ?? false;
  const setSensitive = sensitivity
    ? (id: string, marked: boolean) =>
        sensitivity.onChange(
          marked
            ? [...sensitivity.ids.filter((other) => other !== id), id]
            : sensitivity.ids.filter((other) => other !== id),
        )
    : undefined;
  return { isSensitive, setSensitive };
}

export function AddItemButton({
  onClick,
  children,
}: {
  onClick: () => void;
  children?: ReactNode;
}) {
  return (
    <Button type="button" variant="outline" size="sm" onClick={onClick}>
      <Plus data-icon="inline-start" aria-hidden />
      {children ?? t.addItem}
    </Button>
  );
}

/** Plain text list: one input per item, Enter adds the next item. */
export function TextListInput({
  id,
  label,
  fieldKey,
  draft,
  onChange,
  sensitivity,
}: {
  id: string;
  label: string;
  fieldKey: string;
  draft: Extract<LeafDraft, { kind: "text_list" }>;
  onChange: (draft: Extract<LeafDraft, { kind: "text_list" }>) => void;
  sensitivity?: ItemSensitivity;
}) {
  const { errors } = useEditorContext();
  const [focusId, setFocusId] = useState<string>();
  const { isSensitive, setSensitive } = useListSensitivity(sensitivity);

  const insertAfter = (index: number) => {
    const item = { id: newItemId(), text: "" };
    const items = [...draft.items];
    items.splice(index + 1, 0, item);
    setFocusId(item.id);
    onChange({ ...draft, items });
  };

  return (
    <div id={id} className="space-y-2">
      {draft.items.length > 0 && (
        <ol className="space-y-2">
          {draft.items.map((item, index) => {
            const itemLabel = t.itemLabel(label, index + 1);
            const error = errors[errorKeys.item(fieldKey, item.id)];
            const marked = isSensitive(item.id);
            return (
              <li key={item.id} className="space-y-1">
                <div className="flex items-center gap-1">
                  <Input
                    aria-label={itemLabel}
                    placeholder={t.itemPlaceholder}
                    value={item.text}
                    autoFocus={item.id === focusId}
                    aria-invalid={Boolean(error) || undefined}
                    className={cn(marked && "border-warning/50")}
                    onChange={(event) =>
                      onChange({
                        ...draft,
                        items: draft.items.map((other) =>
                          other.id === item.id ? { ...other, text: event.target.value } : other,
                        ),
                      })
                    }
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && !event.nativeEvent.isComposing) {
                        event.preventDefault();
                        insertAfter(index);
                      }
                    }}
                  />
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
                    sensitive={marked}
                    onSensitiveChange={setSensitive && ((value) => setSensitive(item.id, value))}
                  />
                </div>
                <FieldMessage message={error} />
              </li>
            );
          })}
        </ol>
      )}
      <AddItemButton onClick={() => insertAfter(draft.items.length - 1)} />
    </div>
  );
}
