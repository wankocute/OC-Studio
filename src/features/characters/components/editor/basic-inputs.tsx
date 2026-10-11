"use client";

import { Plus, X } from "lucide-react";

import { SegmentedControl } from "@/components/shared/segmented-control";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { LeafConfig } from "@/features/characters/domain";
import { type LeafDraft, OTHER_CHOICE } from "@/features/characters/editor/drafts";
import { newItemId } from "@/features/characters/editor/ids";
import { optionLabel, unitLabel } from "@/features/characters/editor/layout";
import { messages } from "@/i18n";

const t = messages.editor.inputs;
/** Radix Select cannot use "" as an item value. */
const NONE = "__none";

type DraftOf<K extends LeafDraft["kind"]> = Extract<LeafDraft, { kind: K }>;
type ConfigOf<K extends LeafConfig["kind"]> = Extract<LeafConfig, { kind: K }>;

export type InputProps<K extends LeafDraft["kind"]> = {
  /** Id of the primary control (the field label points at it). */
  id: string;
  /** Accessible name, for controls the visible label cannot point at. */
  label: string;
  draft: DraftOf<K>;
  onChange: (draft: DraftOf<K>) => void;
  invalid?: boolean;
  describedBy?: string;
};

export function TextInput({
  id,
  draft,
  onChange,
  invalid,
  describedBy,
}: InputProps<"short_text" | "long_text">) {
  const common = {
    id,
    value: draft.text,
    "aria-invalid": invalid || undefined,
    "aria-describedby": describedBy,
  };
  return draft.kind === "long_text" ? (
    <Textarea
      {...common}
      rows={3}
      className="min-h-20"
      onChange={(event) => onChange({ ...draft, text: event.target.value })}
    />
  ) : (
    <Input {...common} onChange={(event) => onChange({ ...draft, text: event.target.value })} />
  );
}

export function NumberInput({ id, draft, onChange, invalid, describedBy }: InputProps<"number">) {
  return (
    <Input
      id={id}
      inputMode="decimal"
      value={draft.text}
      onChange={(event) => onChange({ ...draft, text: event.target.value })}
      aria-invalid={invalid || undefined}
      aria-describedby={describedBy}
      className="max-w-48"
    />
  );
}

export function MeasureInput({
  id,
  label,
  draft,
  onChange,
  invalid,
  describedBy,
  config,
}: InputProps<"measure"> & { config: ConfigOf<"measure"> }) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Input
        id={id}
        inputMode="decimal"
        value={draft.value}
        onChange={(event) => onChange({ ...draft, value: event.target.value })}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        className="w-28"
      />
      {config.units.length > 1 ? (
        <Select value={draft.unit} onValueChange={(unit) => onChange({ ...draft, unit })}>
          <SelectTrigger aria-label={`${label} — ${t.unit}`} className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {config.units.map((unit) => (
              <SelectItem key={unit} value={unit}>
                {unitLabel(unit)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : (
        <span className="text-sm text-muted-foreground">{unitLabel(draft.unit)}</span>
      )}
      <div className="flex items-center gap-2">
        <Checkbox
          id={`${id}-approximate`}
          checked={draft.approximate}
          onCheckedChange={(checked) => onChange({ ...draft, approximate: checked === true })}
        />
        <Label htmlFor={`${id}-approximate`} className="font-normal">
          {t.approximate}
        </Label>
      </div>
    </div>
  );
}

/** Three distinct answers: unknown is not "no". */
export function BooleanInput({ id, label, draft, onChange }: InputProps<"boolean">) {
  const value = draft.value === null ? "unknown" : draft.value ? "yes" : "no";
  return (
    <SegmentedControl
      id={id}
      size="default"
      ariaLabel={label}
      value={value}
      onValueChange={(next) =>
        // Clicking the active item deselects it in Radix; treat that as "unknown".
        onChange({ ...draft, value: next === "yes" ? true : next === "no" ? false : null })
      }
      options={[
        { value: "unknown", label: t.unknown },
        { value: "yes", label: t.yes },
        { value: "no", label: t.no },
      ]}
    />
  );
}

const MONTHS = Array.from({ length: 12 }, (_, index) => String(index + 1));

export function DateInput({
  id,
  label,
  draft,
  onChange,
  invalid,
  describedBy,
}: InputProps<"date">) {
  return (
    <div className="space-y-3">
      <SegmentedControl<typeof draft.mode>
        ariaLabel={`${label} — ${t.dateType}`}
        value={draft.mode}
        onValueChange={(mode) => mode && onChange({ ...draft, mode })}
        options={[
          { value: "calendar", label: t.dateCalendar },
          { value: "text", label: t.dateText },
        ]}
      />
      {draft.mode === "text" ? (
        <Input
          id={id}
          aria-label={`${label} — ${t.dateText}`}
          placeholder={t.dateTextPlaceholder}
          value={draft.text}
          onChange={(event) => onChange({ ...draft, text: event.target.value })}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
        />
      ) : (
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label htmlFor={`${id}-day`} className="text-xs text-muted-foreground">
              {t.day}
            </Label>
            <Input
              id={`${id}-day`}
              inputMode="numeric"
              value={draft.day}
              onChange={(event) => onChange({ ...draft, day: event.target.value })}
              aria-invalid={invalid || undefined}
              className="w-16"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor={`${id}-month`} className="text-xs text-muted-foreground">
              {t.month}
            </Label>
            <Select
              value={draft.month || NONE}
              onValueChange={(month) => onChange({ ...draft, month: month === NONE ? "" : month })}
            >
              <SelectTrigger
                id={`${id}-month`}
                className="w-24"
                aria-invalid={invalid || undefined}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>—</SelectItem>
                {MONTHS.map((month) => (
                  <SelectItem key={month} value={month}>
                    {month}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor={id} className="text-xs text-muted-foreground">
              {t.year}
            </Label>
            <Input
              id={id}
              inputMode="numeric"
              value={draft.year}
              title={t.yearHint}
              onChange={(event) => onChange({ ...draft, year: event.target.value })}
              aria-invalid={invalid || undefined}
              aria-describedby={describedBy}
              className="w-24"
            />
          </div>
          <div className="flex h-8 items-center gap-2">
            <Checkbox
              id={`${id}-approximate`}
              checked={draft.approximate}
              onCheckedChange={(checked) => onChange({ ...draft, approximate: checked === true })}
            />
            <Label htmlFor={`${id}-approximate`} className="font-normal">
              {t.approximate}
            </Label>
          </div>
        </div>
      )}
    </div>
  );
}

export function SingleSelectInput({
  id,
  label,
  draft,
  onChange,
  invalid,
  describedBy,
  config,
  optionPath,
}: InputProps<"single_select"> & { config: ConfigOf<"single_select">; optionPath: string }) {
  return (
    <div className="space-y-2">
      <Select
        value={draft.choice || NONE}
        onValueChange={(choice) => onChange({ ...draft, choice: choice === NONE ? "" : choice })}
      >
        <SelectTrigger
          id={id}
          className="w-full sm:w-72"
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>{t.selectPlaceholder}</SelectItem>
          {config.options.map((option) => (
            <SelectItem key={option.code} value={option.code}>
              {optionLabel(optionPath, option)}
            </SelectItem>
          ))}
          {config.allowOther && <SelectItem value={OTHER_CHOICE}>{t.other}</SelectItem>}
        </SelectContent>
      </Select>
      {draft.choice === OTHER_CHOICE && (
        <Input
          aria-label={`${label} — ${t.otherPlaceholder}`}
          placeholder={t.otherPlaceholder}
          value={draft.other}
          onChange={(event) => onChange({ ...draft, other: event.target.value })}
          aria-invalid={invalid || undefined}
          className="sm:max-w-md"
        />
      )}
    </div>
  );
}

export function MultiSelectInput({
  id,
  label,
  draft,
  onChange,
  config,
  optionPath,
}: InputProps<"multi_select"> & { config: ConfigOf<"multi_select">; optionPath: string }) {
  const toggle = (code: string, checked: boolean) =>
    onChange({
      ...draft,
      options: checked
        ? [...draft.options, code]
        : draft.options.filter((selected) => selected !== code),
    });
  return (
    <div className="space-y-3">
      <div id={id} className="flex flex-wrap gap-x-5 gap-y-2">
        {config.options.map((option) => {
          const optionId = `${id}-${option.code}`;
          return (
            <div key={option.code} className="flex items-center gap-2">
              <Checkbox
                id={optionId}
                checked={draft.options.includes(option.code)}
                onCheckedChange={(checked) => toggle(option.code, checked === true)}
              />
              <Label htmlFor={optionId} className="font-normal">
                {optionLabel(optionPath, option)}
              </Label>
            </div>
          );
        })}
      </div>
      {config.allowOther && (
        <div className="space-y-2">
          {draft.others.map((other, index) => (
            <div key={other.id} className="flex items-center gap-2">
              <Input
                aria-label={`${label} — ${t.otherLabel(index + 1)}`}
                placeholder={t.otherPlaceholder}
                value={other.text}
                onChange={(event) =>
                  onChange({
                    ...draft,
                    others: draft.others.map((item) =>
                      item.id === other.id ? { ...item, text: event.target.value } : item,
                    ),
                  })
                }
                className="sm:max-w-md"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={t.removeItem(t.otherLabel(index + 1))}
                onClick={() =>
                  onChange({
                    ...draft,
                    others: draft.others.filter((item) => item.id !== other.id),
                  })
                }
              >
                <X aria-hidden />
              </Button>
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              onChange({ ...draft, others: [...draft.others, { id: newItemId(), text: "" }] })
            }
          >
            <Plus data-icon="inline-start" aria-hidden />
            {t.addOther}
          </Button>
        </div>
      )}
    </div>
  );
}
