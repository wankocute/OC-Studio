"use client";

import { useId } from "react";

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
import {
  type BasicFactField,
  type BasicInfoFormState,
  GENDER_IDENTITY_CODES,
  GENDER_OTHER,
} from "@/features/characters/basic-info";
import { factLabelsVi } from "@/features/characters/domain";
import { messages } from "@/i18n";

const f = messages.characters.fields;
const NONE = "__none";

type Values = BasicInfoFormState["values"];

type BasicInfoFieldsProps = {
  values: Values;
  onChange: (patch: Partial<Values>) => void;
  errors: Record<string, string>;
  locked?: BasicInfoFormState["locked"];
  disabled?: boolean;
};

function lockedLabel(state: BasicInfoFormState["locked"][BasicFactField]): string | undefined {
  if (state === "explicit_none") return messages.common.explicitNone;
  if (state === "not_applicable") return messages.common.notApplicable;
  return undefined;
}

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} className="text-xs text-destructive">
      {message}
    </p>
  );
}

/** Controlled inputs for the basic-info subset. Locked fields are shown read-only. */
export function BasicInfoFields({
  values,
  onChange,
  errors,
  locked = {},
  disabled,
}: BasicInfoFieldsProps) {
  const prefix = useId();
  const id = (name: string) => `${prefix}-${name}`;

  const text = (
    name: "fullName" | "pronouns" | "species" | "occupation",
    label: string,
    lockKey: BasicFactField = name,
  ) => {
    const lock = locked[lockKey];
    return (
      <div className="space-y-1.5">
        <Label htmlFor={id(name)}>{label}</Label>
        <Input
          id={id(name)}
          value={lock ? "" : values[name]}
          placeholder={lock ? (lockedLabel(lock) ?? messages.characters.lockedField) : undefined}
          title={lock ? messages.characters.lockedField : undefined}
          onChange={(event) => onChange({ [name]: event.target.value })}
          disabled={disabled || Boolean(lock)}
          aria-invalid={Boolean(errors[name])}
          aria-describedby={errors[name] ? id(`${name}-error`) : undefined}
        />
        <FieldError id={id(`${name}-error`)} message={errors[name]} />
      </div>
    );
  };

  const genderLock = locked.genderIdentity;
  const ageLock = locked.age;

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-1.5 sm:col-span-2">
        <Label htmlFor={id("displayName")}>
          {f.displayName} <span className="text-destructive">*</span>
        </Label>
        <Input
          id={id("displayName")}
          value={values.displayName}
          onChange={(event) => onChange({ displayName: event.target.value })}
          disabled={disabled}
          required
          autoFocus
          aria-invalid={Boolean(errors.displayName)}
          aria-describedby={id(errors.displayName ? "displayName-error" : "displayName-hint")}
        />
        {errors.displayName ? (
          <FieldError id={id("displayName-error")} message={errors.displayName} />
        ) : (
          <p id={id("displayName-hint")} className="text-xs text-muted-foreground">
            {f.displayNameHint}
          </p>
        )}
      </div>

      {text("fullName", f.fullName)}

      <div className="space-y-1.5">
        <Label htmlFor={id("age")}>{f.age}</Label>
        <div className="flex items-center gap-3">
          <Input
            id={id("age")}
            inputMode="numeric"
            value={ageLock ? "" : values.age}
            placeholder={
              ageLock ? (lockedLabel(ageLock) ?? messages.characters.lockedField) : undefined
            }
            title={ageLock ? messages.characters.lockedField : undefined}
            onChange={(event) => onChange({ age: event.target.value })}
            disabled={disabled || Boolean(ageLock)}
            aria-invalid={Boolean(errors.age)}
            aria-describedby={errors.age ? id("age-error") : undefined}
            className="w-28"
          />
          <div className="flex items-center gap-2">
            <Checkbox
              id={id("ageApproximate")}
              checked={values.ageApproximate}
              onCheckedChange={(checked) => onChange({ ageApproximate: checked === true })}
              disabled={disabled || Boolean(ageLock)}
            />
            <Label htmlFor={id("ageApproximate")} className="font-normal">
              {f.ageApproximate}
            </Label>
          </div>
        </div>
        <FieldError id={id("age-error")} message={errors.age} />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={id("genderIdentity")}>{f.genderIdentity}</Label>
        <Select
          value={genderLock ? NONE : values.genderIdentity || NONE}
          onValueChange={(value) => onChange({ genderIdentity: value === NONE ? "" : value })}
          disabled={disabled || Boolean(genderLock)}
        >
          <SelectTrigger id={id("genderIdentity")} className="w-full">
            <SelectValue placeholder={genderLock ? lockedLabel(genderLock) : f.genderNone} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>
              {genderLock ? lockedLabel(genderLock) : f.genderNone}
            </SelectItem>
            {GENDER_IDENTITY_CODES.map((code) => (
              <SelectItem key={code} value={code}>
                {factLabelsVi.options["identity.gender_identity"]?.[code] ?? code}
              </SelectItem>
            ))}
            <SelectItem value={GENDER_OTHER}>{f.genderOther}</SelectItem>
          </SelectContent>
        </Select>
        {values.genderIdentity === GENDER_OTHER && !genderLock && (
          <Input
            aria-label={f.genderOtherPlaceholder}
            placeholder={f.genderOtherPlaceholder}
            value={values.genderOther}
            onChange={(event) => onChange({ genderOther: event.target.value })}
            disabled={disabled}
            aria-invalid={Boolean(errors.genderOther)}
            aria-describedby={errors.genderOther ? id("genderOther-error") : undefined}
          />
        )}
        <FieldError id={id("genderOther-error")} message={errors.genderOther} />
      </div>

      {text("pronouns", f.pronouns)}
      {text("species", f.species)}
      {text("occupation", f.occupation)}
    </div>
  );
}
