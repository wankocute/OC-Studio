"use client";

import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { type ReactNode, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { LeafDraft } from "@/features/characters/editor/drafts";
import { errorKeys } from "@/features/characters/editor/errors";
import { newItemId } from "@/features/characters/editor/ids";
import { messages } from "@/i18n";

import { useEditorContext } from "./editor-context";
import { FieldMessage } from "./field-message";

const t = messages.editor.inputs;

export function moveItem<T>(items: readonly T[], index: number, direction: -1 | 1): T[] {
  const target = index + direction;
  if (target < 0 || target >= items.length) return [...items];
  const next = [...items];
  [next[index], next[target]] = [next[target]!, next[index]!];
  return next;
}

/** Reorder / remove controls of one list item. Ids never change. */
export function ItemControls({
  itemLabel,
  index,
  count,
  onMove,
  onRemove,
}: {
  itemLabel: string;
  index: number;
  count: number;
  onMove: (direction: -1 | 1) => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex shrink-0 items-center">
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
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label={t.removeItem(itemLabel)}
        onClick={onRemove}
      >
        <Trash2 aria-hidden className="text-muted-foreground" />
      </Button>
    </div>
  );
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
}: {
  id: string;
  label: string;
  fieldKey: string;
  draft: Extract<LeafDraft, { kind: "text_list" }>;
  onChange: (draft: Extract<LeafDraft, { kind: "text_list" }>) => void;
}) {
  const { errors } = useEditorContext();
  const [focusId, setFocusId] = useState<string>();

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
            return (
              <li key={item.id} className="space-y-1">
                <div className="flex items-center gap-1">
                  <Input
                    aria-label={itemLabel}
                    placeholder={t.itemPlaceholder}
                    value={item.text}
                    autoFocus={item.id === focusId}
                    aria-invalid={Boolean(error) || undefined}
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
