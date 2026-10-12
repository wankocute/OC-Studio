"use client";

import type { LeafConfig } from "@/features/characters/domain";
import type { LeafDraft } from "@/features/characters/editor/drafts";

import {
  BooleanInput,
  DateInput,
  MeasureInput,
  MultiSelectInput,
  NumberInput,
  SingleSelectInput,
  TextInput,
} from "./basic-inputs";
import { TextListInput } from "./list-inputs";
import { CharacterRefInput, CharacterRefListInput } from "./ref-inputs";

export type LeafInputProps = {
  config: LeafConfig;
  draft: LeafDraft;
  onChange: (draft: LeafDraft) => void;
  id: string;
  label: string;
  /** Field key that owns the value (for item error keys). */
  fieldKey: string;
  /** Option label path: the field key, or `<fieldKey>.<subKey>`. */
  optionPath: string;
  error?: string;
  describedBy?: string;
};

/** Kinds whose single primary control can be the target of a `<label for>`. */
export function hasSingleControl(kind: LeafConfig["kind"]): boolean {
  return ["short_text", "long_text", "number", "measure", "single_select"].includes(kind);
}

/** The control for one leaf value, chosen from the definition's kind. */
export function LeafInput(props: LeafInputProps) {
  const { config, draft, onChange, id, label, fieldKey, optionPath, error, describedBy } = props;
  const common = { id, label, invalid: Boolean(error), describedBy };
  // `draft.kind` always matches `config.kind` (drafts are built from the same definition).
  switch (config.kind) {
    case "short_text":
    case "long_text":
      return <TextInput {...common} draft={draft as never} onChange={onChange} />;
    case "number":
      return <NumberInput {...common} draft={draft as never} onChange={onChange} />;
    case "measure":
      return (
        <MeasureInput {...common} config={config} draft={draft as never} onChange={onChange} />
      );
    case "boolean":
      return <BooleanInput {...common} draft={draft as never} onChange={onChange} />;
    case "date":
      return <DateInput {...common} draft={draft as never} onChange={onChange} />;
    case "single_select":
      return (
        <SingleSelectInput
          {...common}
          config={config}
          optionPath={optionPath}
          draft={draft as never}
          onChange={onChange}
        />
      );
    case "multi_select":
      return (
        <MultiSelectInput
          {...common}
          config={config}
          optionPath={optionPath}
          draft={draft as never}
          onChange={onChange}
        />
      );
    case "text_list":
      return (
        <TextListInput
          id={id}
          label={label}
          fieldKey={fieldKey}
          draft={draft as never}
          onChange={onChange}
        />
      );
    case "character_ref":
      return (
        <CharacterRefInput
          id={id}
          label={label}
          draft={draft as never}
          onChange={onChange}
          error={error}
        />
      );
    case "character_ref_list":
      return (
        <CharacterRefListInput
          id={id}
          label={label}
          fieldKey={fieldKey}
          draft={draft as never}
          onChange={onChange}
        />
      );
  }
}
