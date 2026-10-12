"use client";

import { Ban, CircleSlash, History, MoreHorizontal } from "lucide-react";
import { type ReactNode, useState } from "react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { allowsExplicitNone, type FactValue, type LeafConfig } from "@/features/characters/domain";
import {
  type DraftState,
  emptyValueDraft,
  type FieldDraft,
  type LeafDraft,
} from "@/features/characters/editor/drafts";
import { errorKeys } from "@/features/characters/editor/errors";
import type { EditorField } from "@/features/characters/editor/layout";
import { summarizeFact } from "@/features/characters/editor/summary";
import { messages } from "@/i18n";
import { cn } from "@/lib/utils";

import { useEditorContext } from "./editor-context";
import { FieldMessage } from "./field-message";
import { FieldShredHandle } from "./field-shredder";
import { hasSingleControl, LeafInput } from "./leaf-input";
import { ObjectInput, ObjectListInput } from "./object-inputs";

const t = messages.editor;

export const fieldDomId = (prefix: string, key: string) =>
  `${prefix}field-${key.replace(/[^a-zA-Z0-9_-]/g, "-")}`;

function FieldBadges({ field, inReview }: { field: EditorField; inReview: boolean }) {
  return (
    <>
      {field.scope === "character" && <Badge variant="secondary">{t.badges.custom}</Badge>}
      {field.scope === "library" && <Badge variant="secondary">{t.badges.library}</Badge>}
      {field.deprecated && (
        <Badge variant="outline" title={t.badges.deprecatedHint}>
          {t.badges.deprecated}
        </Badge>
      )}
      {inReview && (
        <Badge variant="outline" className="border-warning/40 text-warning">
          {t.badges.review}
        </Badge>
      )}
    </>
  );
}

function StateMenu({
  field,
  draft,
  canClear,
  onState,
  onClear,
}: {
  field: EditorField;
  draft: FieldDraft;
  canClear: boolean;
  onState: (state: DraftState) => void;
  onClear: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={t.states.menu(field.label)}
        >
          <MoreHorizontal aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuRadioGroup
          value={draft.state}
          onValueChange={(value) => onState(value as DraftState)}
        >
          <DropdownMenuRadioItem value="value">{t.states.enterValue}</DropdownMenuRadioItem>
          {allowsExplicitNone(field.definition) && (
            <DropdownMenuRadioItem value="explicit_none">
              {t.states.explicitNone}
            </DropdownMenuRadioItem>
          )}
          <DropdownMenuRadioItem value="not_applicable">
            {t.states.notApplicable}
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled={!canClear} onSelect={onClear}>
          {t.states.clear}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function StateNotice({ state, onEnterValue }: { state: DraftState; onEnterValue: () => void }) {
  const Icon = state === "explicit_none" ? CircleSlash : Ban;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-muted/60 px-3 py-2.5 text-sm">
      <div className="flex items-start gap-2">
        <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
        <div>
          <p className="font-medium">
            {state === "explicit_none" ? t.states.explicitNone : t.states.notApplicable}
          </p>
          <p className="text-muted-foreground">
            {state === "explicit_none" ? t.states.explicitNoneHint : t.states.notApplicableHint}
          </p>
        </div>
      </div>
      <Button type="button" variant="outline" size="sm" onClick={onEnterValue}>
        {t.states.change}
      </Button>
    </div>
  );
}

/** The value control(s) of a field, chosen from its kind. */
function FieldValueInput({
  field,
  id,
  draft,
  onChange,
  error,
  describedBy,
}: {
  field: EditorField;
  id: string;
  draft: FieldDraft;
  onChange: (draft: FieldDraft) => void;
  error?: string;
  describedBy?: string;
}) {
  const { definition } = field;
  const setValue = (value: FieldDraft["value"]) => onChange({ ...draft, value });

  if (definition.kind === "object" && draft.value.kind === "object") {
    return (
      <ObjectInput
        id={id}
        fieldKey={field.key}
        fields={definition.fields}
        draft={draft.value}
        onChange={setValue}
      />
    );
  }
  if (definition.kind === "object_list" && draft.value.kind === "object_list") {
    return (
      <ObjectListInput
        id={id}
        label={field.label}
        fieldKey={field.key}
        fields={definition.fields}
        draft={draft.value}
        onChange={setValue}
      />
    );
  }
  return (
    <LeafInput
      config={definition as LeafConfig}
      draft={draft.value as LeafDraft}
      onChange={setValue}
      id={id}
      label={field.label}
      fieldKey={field.key}
      optionPath={field.key}
      error={error}
      describedBy={describedBy}
    />
  );
}

export function FieldCard({
  field,
  draft,
  stored,
  onChange,
  children,
}: {
  field: EditorField;
  draft: FieldDraft;
  /** The stored fact (to know whether there is anything to clear). */
  stored: FactValue | undefined;
  onChange: (draft: FieldDraft) => void;
  /** Extra content under the input (e.g. relationship suggestions). */
  children?: ReactNode;
}) {
  const { errors, reviewKeys, idPrefix, nameOf } = useEditorContext();
  const [lifted, setLifted] = useState(false);
  const domId = fieldDomId(idPrefix, field.key);
  const inputId = `${domId}-input`;
  const labelId = `${domId}-label`;
  const errorId = `${domId}-error`;
  const hintId = `${domId}-hint`;
  const error = errors[errorKeys.field(field.key)];
  const single =
    draft.state === "value" &&
    field.definition.kind !== "object" &&
    field.definition.kind !== "object_list" &&
    hasSingleControl(field.definition.kind);
  const hint = field.description ?? t.kindHints[field.definition.kind];

  const canClear = stored !== undefined || draft.state !== "value";
  const clear = () => {
    const previous = draft;
    onChange({ state: "value", value: emptyValueDraft(field.definition), sensitiveItemIds: [] });
    toast(t.states.cleared(field.label), {
      action: { label: t.states.undo, onClick: () => onChange(previous) },
    });
  };

  return (
    <section
      id={domId}
      role="group"
      aria-labelledby={labelId}
      data-field-key={field.key}
      className={cn(
        "group/field scroll-mt-32 space-y-3 rounded-xl border bg-card p-4 transition-opacity duration-200",
        error ? "border-destructive/40" : "border-border/80",
        lifted && "opacity-50",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <Label id={labelId} htmlFor={single ? inputId : undefined} className="text-sm">
              {field.label}
            </Label>
            <FieldBadges field={field} inReview={reviewKeys.has(field.key)} />
          </div>
          {hint && <FieldMessage id={hintId} tone="hint" message={hint} />}
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          {/* Only a field with something to clear can be dragged to the bin; the handle stays
              while its drop animation runs, after the value is already gone. */}
          {(canClear || lifted) && (
            <FieldShredHandle
              label={field.label}
              summary={summarizeFact(field.definition, stored, nameOf)}
              onShred={clear}
              onLiftChange={setLifted}
            />
          )}
          <StateMenu
            field={field}
            draft={draft}
            canClear={canClear}
            onState={(state) => onChange({ ...draft, state })}
            onClear={clear}
          />
        </div>
      </div>

      {draft.state === "value" ? (
        <FieldValueInput
          field={field}
          id={inputId}
          draft={draft}
          onChange={onChange}
          error={error}
          describedBy={[hint ? hintId : "", error ? errorId : ""].join(" ").trim() || undefined}
        />
      ) : (
        <StateNotice
          state={draft.state}
          onEnterValue={() => onChange({ ...draft, state: "value" })}
        />
      )}
      <FieldMessage id={errorId} message={error} />
      {children}
    </section>
  );
}

/** A retired built-in field that still holds data: shown read-only, can only be removed. */
export function LegacyFieldCard({
  field,
  stored,
  onRemove,
}: {
  field: EditorField;
  stored: FactValue;
  onRemove: () => void;
}) {
  const { nameOf, reviewKeys, idPrefix } = useEditorContext();
  const labelId = `${fieldDomId(idPrefix, field.key)}-label`;
  return (
    <section
      id={fieldDomId(idPrefix, field.key)}
      role="group"
      aria-labelledby={labelId}
      className="scroll-mt-32 space-y-3 rounded-xl border border-dashed bg-muted/30 p-4"
    >
      <div className="flex flex-wrap items-center gap-2">
        <History className="size-4 text-muted-foreground" aria-hidden />
        <h3 id={labelId} className="text-sm font-medium">
          {field.label}
        </h3>
        <Badge variant="outline">{t.legacy.title}</Badge>
        <FieldBadges field={{ ...field, deprecated: false }} inReview={reviewKeys.has(field.key)} />
      </div>
      <p className="text-sm">{summarizeFact(field.definition, stored, nameOf)}</p>
      <p className="text-xs text-muted-foreground">{t.legacy.body}</p>
      <ConfirmDialog
        trigger={
          <Button type="button" variant="outline" size="sm">
            {t.legacy.remove}
          </Button>
        }
        title={t.legacy.removeTitle}
        description={t.legacy.removeBody}
        confirmLabel={t.legacy.remove}
        onConfirm={async () => {
          onRemove();
          return true;
        }}
      />
    </section>
  );
}
