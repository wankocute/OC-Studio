"use client";

import { Plus, X } from "lucide-react";
import { type FormEvent, useId, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { allowsExplicitNone, type FieldScope } from "@/features/characters/domain";
import {
  type DefinitionDraft,
  type DefinitionErrors,
  emptySubfieldDraft,
  FIELD_KINDS,
  KNOWN_UNITS,
  LEAF_KINDS,
  type LeafConfigDraft,
} from "@/features/characters/editor/custom-fields";
import { newOptionCode, newSubfieldKey } from "@/features/characters/editor/ids";
import { unitLabel } from "@/features/characters/editor/layout";
import { messages } from "@/i18n";
import { useOverlayScrollbars } from "@/hooks/use-overlay-scrollbars";

import { FieldMessage } from "./field-message";

const t = messages.editor.definition;
const kindLabels = messages.editor.kinds;
const UNIT_PATTERN = /^[a-z][a-z0-9_]{0,63}$/;

export type GroupOption = { id: string; label: string };

export type DefinitionSubmitResult = { ok: true } | { ok: false; errors: DefinitionErrors };

/** What an existing definition with stored values may no longer change. */
export type DefinitionLocks = {
  kind: boolean;
  optionCodes: ReadonlySet<string>;
  subfieldKeys: ReadonlySet<string>;
  units: ReadonlySet<string>;
};

const NO_LOCKS: DefinitionLocks = {
  kind: false,
  optionCodes: new Set(),
  subfieldKeys: new Set(),
  units: new Set(),
};

/** Options / number range / units of one leaf config (field or sub-field). */
function LeafConfigEditor({
  idPrefix,
  draft,
  onChange,
  errors,
  errorPrefix,
  locks,
}: {
  idPrefix: string;
  draft: LeafConfigDraft;
  onChange: (draft: LeafConfigDraft) => void;
  errors: DefinitionErrors;
  errorPrefix: string;
  locks: DefinitionLocks;
}) {
  const [unitInput, setUnitInput] = useState("");
  const unitValid = UNIT_PATTERN.test(unitInput.trim());

  if (draft.kind === "single_select" || draft.kind === "multi_select") {
    return (
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">{t.options}</legend>
        <ol className="space-y-2">
          {draft.options.map((option, index) => {
            const error = errors[`${errorPrefix}options.${index}`];
            const locked = locks.optionCodes.has(option.code);
            return (
              <li key={option.code} className="space-y-1">
                <div className="flex items-center gap-2">
                  <Input
                    aria-label={t.optionLabel(index + 1)}
                    value={option.label}
                    aria-invalid={Boolean(error) || undefined}
                    onChange={(event) =>
                      onChange({
                        ...draft,
                        options: draft.options.map((other) =>
                          other.code === option.code
                            ? { ...other, label: event.target.value }
                            : other,
                        ),
                      })
                    }
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={t.removeOption(index + 1)}
                    title={locked ? t.lockedExisting : undefined}
                    disabled={locked}
                    onClick={() =>
                      onChange({
                        ...draft,
                        options: draft.options.filter((other) => other.code !== option.code),
                      })
                    }
                  >
                    <X aria-hidden />
                  </Button>
                </div>
                <FieldMessage message={error} />
              </li>
            );
          })}
        </ol>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() =>
            onChange({
              ...draft,
              options: [...draft.options, { code: newOptionCode(), label: "" }],
            })
          }
        >
          <Plus data-icon="inline-start" aria-hidden />
          {t.addOption}
        </Button>
        <div className="flex items-center gap-2 pt-1">
          <Checkbox
            id={`${idPrefix}-allow-other`}
            checked={draft.allowOther}
            onCheckedChange={(checked) => onChange({ ...draft, allowOther: checked === true })}
          />
          <Label htmlFor={`${idPrefix}-allow-other`} className="font-normal">
            {t.allowOther}
          </Label>
        </div>
      </fieldset>
    );
  }

  if (draft.kind !== "number" && draft.kind !== "measure") return null;

  const units = [...new Set([...KNOWN_UNITS, ...draft.units])];
  return (
    <div className="space-y-3">
      {draft.kind === "measure" && (
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">{t.units}</legend>
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            {units.map((unit) => (
              <div key={unit} className="flex items-center gap-2">
                <Checkbox
                  id={`${idPrefix}-unit-${unit}`}
                  checked={draft.units.includes(unit)}
                  disabled={locks.units.has(unit)}
                  onCheckedChange={(checked) =>
                    onChange({
                      ...draft,
                      units: checked
                        ? [...draft.units, unit]
                        : draft.units.filter((other) => other !== unit),
                    })
                  }
                />
                <Label htmlFor={`${idPrefix}-unit-${unit}`} className="font-normal">
                  {unitLabel(unit)}
                </Label>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <Input
              aria-label={t.customUnit}
              placeholder={t.customUnitPlaceholder}
              value={unitInput}
              onChange={(event) => setUnitInput(event.target.value)}
              className="max-w-48"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!unitValid}
              onClick={() => {
                const unit = unitInput.trim();
                if (!draft.units.includes(unit))
                  onChange({ ...draft, units: [...draft.units, unit] });
                setUnitInput("");
              }}
            >
              {t.addUnit}
            </Button>
          </div>
          {unitInput.trim() !== "" && !unitValid && <FieldMessage message={t.unitInvalid} />}
          <FieldMessage message={errors[`${errorPrefix}units`]} />
        </fieldset>
      )}
      <div className="flex flex-wrap items-end gap-3">
        {draft.kind === "number" && (
          <div className="flex h-8 items-center gap-2">
            <Checkbox
              id={`${idPrefix}-integer`}
              checked={draft.integer}
              onCheckedChange={(checked) => onChange({ ...draft, integer: checked === true })}
            />
            <Label htmlFor={`${idPrefix}-integer`} className="font-normal">
              {t.integer}
            </Label>
          </div>
        )}
        {(["min", "max"] as const).map((bound) => (
          <div key={bound} className="space-y-1">
            <Label htmlFor={`${idPrefix}-${bound}`} className="text-xs text-muted-foreground">
              {t[bound]}
            </Label>
            <Input
              id={`${idPrefix}-${bound}`}
              inputMode="decimal"
              value={draft[bound]}
              onChange={(event) => onChange({ ...draft, [bound]: event.target.value })}
              className="w-28"
            />
          </div>
        ))}
      </div>
      <FieldMessage message={errors[`${errorPrefix}min`] ?? errors[`${errorPrefix}max`]} />
    </div>
  );
}

export function DefinitionDialog({
  open,
  onOpenChange,
  title,
  initial,
  scopes,
  initialScope,
  groupOptions,
  locks = NO_LOCKS,
  notice,
  submitLabel,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  initial: DefinitionDraft;
  /** Scopes the user may choose from (one = fixed). */
  scopes: readonly Exclude<FieldScope, "builtin">[];
  initialScope: Exclude<FieldScope, "builtin">;
  groupOptions: (scope: Exclude<FieldScope, "builtin">) => GroupOption[];
  locks?: DefinitionLocks;
  notice?: string;
  submitLabel: string;
  onSubmit: (
    draft: DefinitionDraft,
    scope: Exclude<FieldScope, "builtin">,
  ) => Promise<DefinitionSubmitResult>;
}) {
  const prefix = useId();
  const [draft, setDraft] = useState(initial);
  const scrollbars = useOverlayScrollbars<HTMLDivElement>();
  const [scope, setScope] = useState(initialScope);
  const [errors, setErrors] = useState<DefinitionErrors>({});
  const [pending, startTransition] = useTransition();
  const groups = groupOptions(scope);
  const composite = draft.kind === "object" || draft.kind === "object_list";
  const update = (patch: Partial<DefinitionDraft>) =>
    setDraft((current) => ({ ...current, ...patch }));

  const submit = (event: FormEvent) => {
    event.preventDefault();
    startTransition(async () => {
      const result = await onSubmit(draft, scope);
      if (result.ok) onOpenChange(false);
      else setErrors(result.errors);
    });
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <DialogContent ref={scrollbars} className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <form onSubmit={submit} noValidate className="space-y-5">
          <DialogHeader>
            <DialogTitle className="font-heading text-xl">{title}</DialogTitle>
            <DialogDescription>{notice ?? t.createDescription}</DialogDescription>
          </DialogHeader>

          {scopes.length > 1 && (
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">{t.scope}</legend>
              <RadioGroup
                value={scope}
                onValueChange={(value) => {
                  const next = value as typeof scope;
                  setScope(next);
                  // Library fields cannot sit in a character's own group.
                  if (!groupOptions(next).some((group) => group.id === draft.group)) {
                    update({ group: groupOptions(next)[0]?.id ?? "" });
                  }
                }}
                className="flex flex-wrap gap-4"
              >
                {scopes.map((option) => (
                  <div key={option} className="flex items-center gap-2">
                    <RadioGroupItem id={`${prefix}-scope-${option}`} value={option} />
                    <Label htmlFor={`${prefix}-scope-${option}`} className="font-normal">
                      {option === "character" ? t.scopeCharacter : t.scopeLibrary}
                    </Label>
                  </div>
                ))}
              </RadioGroup>
            </fieldset>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor={`${prefix}-label`}>
                {t.label} <span className="text-destructive">*</span>
              </Label>
              <Input
                id={`${prefix}-label`}
                value={draft.label}
                onChange={(event) => update({ label: event.target.value })}
                aria-invalid={Boolean(errors.label) || undefined}
                autoFocus
              />
              <FieldMessage message={errors.label} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`${prefix}-kind`}>{t.kind}</Label>
              <Select
                value={draft.kind}
                disabled={locks.kind}
                onValueChange={(kind) => update({ kind: kind as DefinitionDraft["kind"] })}
              >
                <SelectTrigger
                  id={`${prefix}-kind`}
                  className="w-full"
                  title={locks.kind ? t.kindLocked : undefined}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FIELD_KINDS.map((kind) => (
                    <SelectItem key={kind} value={kind}>
                      {kindLabels[kind]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {locks.kind && <FieldMessage tone="hint" message={t.kindLocked} />}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`${prefix}-group`}>{t.group}</Label>
              <Select value={draft.group} onValueChange={(group) => update({ group })}>
                <SelectTrigger
                  id={`${prefix}-group`}
                  className="w-full"
                  aria-invalid={Boolean(errors.group) || undefined}
                >
                  <SelectValue placeholder={t.noGroupAvailable} />
                </SelectTrigger>
                <SelectContent>
                  {groups.map((group) => (
                    <SelectItem key={group.id} value={group.id}>
                      {group.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldMessage message={errors.group} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor={`${prefix}-description`}>{t.descriptionField}</Label>
              <Textarea
                id={`${prefix}-description`}
                rows={2}
                placeholder={t.descriptionPlaceholder}
                value={draft.description}
                onChange={(event) => update({ description: event.target.value })}
              />
              <FieldMessage message={errors.description} />
            </div>
          </div>

          {!composite && (
            <LeafConfigEditor
              idPrefix={`${prefix}-config`}
              draft={{ ...draft, kind: draft.kind as LeafConfigDraft["kind"] }}
              onChange={(config) => update(config)}
              errors={errors}
              errorPrefix=""
              locks={locks}
            />
          )}

          {composite && (
            <fieldset className="space-y-3">
              <legend className="text-sm font-medium">{t.subfields}</legend>
              <ol className="space-y-3">
                {draft.subfields.map((subfield, index) => {
                  const locked = locks.subfieldKeys.has(subfield.key);
                  const setSubfield = (patch: Partial<typeof subfield>) =>
                    update({
                      subfields: draft.subfields.map((other) =>
                        other.key === subfield.key ? { ...other, ...patch } : other,
                      ),
                    });
                  const error = errors[`subfields.${index}.label`];
                  return (
                    <li key={subfield.key} className="space-y-3 rounded-lg border p-3">
                      <div className="flex flex-wrap items-start gap-2">
                        <div className="min-w-40 flex-1 space-y-1">
                          <Input
                            aria-label={t.subfieldLabel(index + 1)}
                            placeholder={t.subfieldLabel(index + 1)}
                            value={subfield.label}
                            aria-invalid={Boolean(error) || undefined}
                            onChange={(event) => setSubfield({ label: event.target.value })}
                          />
                          <FieldMessage message={error} />
                        </div>
                        <Select
                          value={subfield.kind}
                          disabled={locked}
                          onValueChange={(kind) =>
                            setSubfield({ kind: kind as typeof subfield.kind })
                          }
                        >
                          <SelectTrigger aria-label={t.subfieldKind(index + 1)} className="w-44">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {LEAF_KINDS.map((kind) => (
                              <SelectItem key={kind} value={kind}>
                                {kindLabels[kind]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          aria-label={t.removeSubfield(index + 1)}
                          title={locked ? t.lockedExisting : undefined}
                          disabled={locked}
                          onClick={() =>
                            update({
                              subfields: draft.subfields.filter(
                                (other) => other.key !== subfield.key,
                              ),
                            })
                          }
                        >
                          <X aria-hidden />
                        </Button>
                      </div>
                      <div className="flex flex-wrap gap-4">
                        <div className="flex items-center gap-2">
                          <Checkbox
                            id={`${prefix}-${subfield.key}-required`}
                            checked={subfield.required}
                            onCheckedChange={(checked) =>
                              setSubfield({ required: checked === true })
                            }
                          />
                          <Label
                            htmlFor={`${prefix}-${subfield.key}-required`}
                            className="font-normal"
                          >
                            {t.required}
                          </Label>
                        </div>
                      </div>
                      <LeafConfigEditor
                        idPrefix={`${prefix}-${subfield.key}`}
                        draft={subfield}
                        onChange={(config) => setSubfield(config)}
                        errors={errors}
                        errorPrefix={`subfields.${index}.`}
                        locks={locks}
                      />
                    </li>
                  );
                })}
              </ol>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  update({ subfields: [...draft.subfields, emptySubfieldDraft(newSubfieldKey())] })
                }
              >
                <Plus data-icon="inline-start" aria-hidden />
                {t.addSubfield}
              </Button>
            </fieldset>
          )}

          <div className="space-y-3">
            {!allowsExplicitNone({ kind: draft.kind } as never) && (
              <div className="flex items-start gap-2">
                <Checkbox
                  id={`${prefix}-explicit-none`}
                  checked={draft.allowExplicitNone}
                  onCheckedChange={(checked) => update({ allowExplicitNone: checked === true })}
                />
                <div className="space-y-0.5">
                  <Label htmlFor={`${prefix}-explicit-none`} className="font-normal">
                    {t.allowExplicitNone}
                  </Label>
                  <FieldMessage tone="hint" message={t.allowExplicitNoneHint} />
                </div>
              </div>
            )}
          </div>

          {errors.form && (
            <p
              role="alert"
              className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {errors.form}
            </p>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={pending}
            >
              {messages.common.cancel}
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? messages.common.saving : submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
