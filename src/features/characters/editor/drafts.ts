/**
 * Form drafts ⇄ stored facts.
 *
 * A draft is what the form controls hold: strings for number boxes, the chosen state, list items
 * with their stable ids, and the per-item sensitivity marks. Drafts are lossless with respect to
 * what the user typed (an invalid "12a" stays "12a" so validation can report it), while
 * `draftToFact` produces the stored fact through `normalizeFactInput` — the only place where
 * blanks become "unspecified". Drafts never invent ids: items keep the id they were created with.
 */
import {
  type CharacterRef,
  type CharacterRefItem,
  type Choice,
  type DetachedFrom,
  type FactValue,
  type FieldConfig,
  type FieldMeta,
  type FlexibleDate,
  isRepeatedKind,
  type LeafConfig,
  type Measure,
  normalizeFactInput,
  type ObjectItem,
  type ObjectValue,
  type SubfieldDefinition,
  type TextItem,
} from "@/features/characters/domain";

/** Value of a single-select draft meaning "the user's own answer". */
export const OTHER_CHOICE = "__other";

export type RefDraft =
  | { type: "character"; characterId: string }
  | { type: "unlinked"; name: string; note: string; detachedFrom?: DetachedFrom };

export type RefItemDraft = { id: string; ref: RefDraft };

export type LeafDraft =
  | { kind: "short_text" | "long_text"; text: string }
  | { kind: "number"; text: string }
  | { kind: "measure"; value: string; unit: string; approximate: boolean }
  | { kind: "boolean"; value: boolean | null }
  | {
      kind: "date";
      mode: "calendar" | "text";
      year: string;
      month: string;
      day: string;
      approximate: boolean;
      text: string;
    }
  | { kind: "single_select"; choice: string; other: string }
  | { kind: "multi_select"; options: string[]; others: TextItem[] }
  | { kind: "text_list"; items: TextItem[] }
  | { kind: "character_ref"; ref: RefDraft | null }
  | { kind: "character_ref_list"; items: RefItemDraft[] };

export type ObjectItemDraft = { id: string; fields: Record<string, LeafDraft> };

export type ValueDraft =
  | LeafDraft
  | { kind: "object"; fields: Record<string, LeafDraft> }
  | { kind: "object_list"; items: ObjectItemDraft[] };

/** `value` covers both "specified" and "unspecified": a blank value is simply not stored. */
export type DraftState = "value" | "explicit_none" | "not_applicable";

export type FieldDraft = {
  state: DraftState;
  /** Kept while another state is chosen, so switching back restores what was typed. */
  value: ValueDraft;
  /** Ids of list items marked sensitive (SEN-02). */
  sensitiveItemIds: string[];
};

type AnyFieldConfig = FieldConfig & FieldMeta;

// ---------------------------------------------------------------------------
// Empty drafts
// ---------------------------------------------------------------------------

export function emptyLeafDraft(config: LeafConfig): LeafDraft {
  switch (config.kind) {
    case "short_text":
    case "long_text":
      return { kind: config.kind, text: "" };
    case "number":
      return { kind: "number", text: "" };
    case "measure":
      return { kind: "measure", value: "", unit: config.units[0] ?? "", approximate: false };
    case "boolean":
      return { kind: "boolean", value: null };
    case "date":
      return {
        kind: "date",
        mode: "calendar",
        year: "",
        month: "",
        day: "",
        approximate: false,
        text: "",
      };
    case "single_select":
      return { kind: "single_select", choice: "", other: "" };
    case "multi_select":
      return { kind: "multi_select", options: [], others: [] };
    case "text_list":
      return { kind: "text_list", items: [] };
    case "character_ref":
      return { kind: "character_ref", ref: null };
    case "character_ref_list":
      return { kind: "character_ref_list", items: [] };
  }
}

function emptySubfields(fields: readonly SubfieldDefinition[]): Record<string, LeafDraft> {
  return Object.fromEntries(fields.map((subfield) => [subfield.key, emptyLeafDraft(subfield)]));
}

export function emptyValueDraft(config: FieldConfig): ValueDraft {
  if (config.kind === "object") return { kind: "object", fields: emptySubfields(config.fields) };
  if (config.kind === "object_list") return { kind: "object_list", items: [] };
  return emptyLeafDraft(config);
}

export function emptyObjectItem(
  config: { readonly fields: readonly SubfieldDefinition[] },
  id: string,
): ObjectItemDraft {
  return { id, fields: emptySubfields(config.fields) };
}

// ---------------------------------------------------------------------------
// Stored value → draft (deterministic: no generated ids)
// ---------------------------------------------------------------------------

const numberText = (value: number | undefined) => (value === undefined ? "" : String(value));

function refToDraft(ref: CharacterRef): RefDraft {
  if (ref.type === "character") return { type: "character", characterId: ref.characterId };
  return {
    type: "unlinked",
    name: ref.name,
    note: ref.note ?? "",
    ...(ref.detachedFrom ? { detachedFrom: ref.detachedFrom } : {}),
  };
}

export function leafToDraft(config: LeafConfig, value: unknown): LeafDraft {
  if (value === undefined) return emptyLeafDraft(config);
  switch (config.kind) {
    case "short_text":
    case "long_text":
      return { kind: config.kind, text: String(value) };
    case "number":
      return { kind: "number", text: numberText(value as number) };
    case "measure": {
      const measure = value as Measure;
      return {
        kind: "measure",
        value: numberText(measure.value),
        unit: measure.unit,
        approximate: measure.approximate === true,
      };
    }
    case "boolean":
      return { kind: "boolean", value: value as boolean };
    case "date": {
      const date = value as FlexibleDate;
      const empty = emptyLeafDraft(config) as Extract<LeafDraft, { kind: "date" }>;
      if (date.type === "text") return { ...empty, mode: "text", text: date.text };
      return {
        ...empty,
        year: numberText(date.year),
        month: numberText(date.month),
        day: numberText(date.day),
        approximate: date.approximate === true,
      };
    }
    case "single_select": {
      const choice = value as Choice;
      return "other" in choice
        ? { kind: "single_select", choice: OTHER_CHOICE, other: choice.other }
        : { kind: "single_select", choice: choice.option, other: "" };
    }
    case "multi_select": {
      const choices = value as Choice[];
      return {
        kind: "multi_select",
        options: choices.flatMap((choice) => ("option" in choice ? [choice.option] : [])),
        // UI-only ids for the free-text answers (multi_select values carry no item ids).
        others: choices.flatMap((choice, index) =>
          "other" in choice ? [{ id: `other_${index}`, text: choice.other }] : [],
        ),
      };
    }
    case "text_list":
      return { kind: "text_list", items: (value as TextItem[]).map((item) => ({ ...item })) };
    case "character_ref":
      return { kind: "character_ref", ref: refToDraft(value as CharacterRef) };
    case "character_ref_list":
      return {
        kind: "character_ref_list",
        items: (value as CharacterRefItem[]).map((item) => ({
          id: item.id,
          ref: refToDraft(item.ref),
        })),
      };
  }
}

function objectFieldsToDraft(
  fields: readonly SubfieldDefinition[],
  value: ObjectValue,
): Record<string, LeafDraft> {
  return Object.fromEntries(
    fields.map((subfield) => [subfield.key, leafToDraft(subfield, value[subfield.key])]),
  );
}

export function valueToDraft(config: FieldConfig, value: unknown): ValueDraft {
  if (config.kind === "object") {
    return {
      kind: "object",
      fields: objectFieldsToDraft(config.fields, (value ?? {}) as ObjectValue),
    };
  }
  if (config.kind === "object_list") {
    return {
      kind: "object_list",
      items: ((value ?? []) as ObjectItem[]).map((item) => ({
        id: item.id,
        fields: objectFieldsToDraft(config.fields, item),
      })),
    };
  }
  return leafToDraft(config, value);
}

/** Draft for a stored fact (`undefined` = unspecified). */
export function factToDraft(config: FieldConfig, fact: FactValue | undefined): FieldDraft {
  if (!fact) return { state: "value", value: emptyValueDraft(config), sensitiveItemIds: [] };
  if (fact.state !== "specified") {
    return { state: fact.state, value: emptyValueDraft(config), sensitiveItemIds: [] };
  }
  return {
    state: "value",
    value: valueToDraft(config, fact.value),
    sensitiveItemIds: [...(fact.sensitiveItemIds ?? [])],
  };
}

// ---------------------------------------------------------------------------
// Draft → raw input (then normalised by `normalizeFactInput`)
// ---------------------------------------------------------------------------

/**
 * Numbers accept a decimal comma ("1,5"). Unparseable text becomes `NaN`, which normalisation
 * keeps so that validation reports it instead of silently dropping the input.
 */
export function parseNumberInput(text: string): number | undefined {
  const trimmed = text.trim();
  if (trimmed === "") return undefined;
  return Number(trimmed.replace(",", "."));
}

function refDraftToRaw(ref: RefDraft): unknown {
  if (ref.type === "character") return { type: "character", characterId: ref.characterId };
  return {
    type: "unlinked",
    name: ref.name,
    note: ref.note,
    ...(ref.detachedFrom ? { detachedFrom: ref.detachedFrom } : {}),
  };
}

export function leafDraftToRaw(draft: LeafDraft): unknown {
  switch (draft.kind) {
    case "short_text":
    case "long_text":
    case "number":
      return draft.kind === "number" ? parseNumberInput(draft.text) : draft.text;
    case "measure":
      return {
        value: parseNumberInput(draft.value),
        unit: draft.unit,
        approximate: draft.approximate || undefined,
      };
    case "boolean":
      return draft.value ?? undefined;
    case "date":
      return draft.mode === "text"
        ? { type: "text", text: draft.text }
        : {
            type: "calendar",
            year: parseNumberInput(draft.year),
            month: parseNumberInput(draft.month),
            day: parseNumberInput(draft.day),
            approximate: draft.approximate || undefined,
          };
    case "single_select":
      if (draft.choice === "") return undefined;
      return draft.choice === OTHER_CHOICE ? { other: draft.other } : { option: draft.choice };
    case "multi_select":
      return [
        ...draft.options.map((option) => ({ option })),
        ...draft.others.map((item) => ({ other: item.text })),
      ];
    case "text_list":
      return draft.items.map((item) => ({ id: item.id, text: item.text }));
    case "character_ref":
      return draft.ref ? refDraftToRaw(draft.ref) : undefined;
    case "character_ref_list":
      return draft.items.map((item) => ({ id: item.id, ref: refDraftToRaw(item.ref) }));
  }
}

function objectFieldsToRaw(fields: Record<string, LeafDraft>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(fields).map(([key, draft]) => [key, leafDraftToRaw(draft)]),
  );
}

export function valueDraftToRaw(draft: ValueDraft): unknown {
  if (draft.kind === "object") return objectFieldsToRaw(draft.fields);
  if (draft.kind === "object_list") {
    return draft.items.map((item) => ({ id: item.id, ...objectFieldsToRaw(item.fields) }));
  }
  return leafDraftToRaw(draft);
}

/**
 * The stored fact for a draft, or `undefined` for "unspecified". Blank items are dropped by
 * normalisation; sensitivity marks follow their items and are kept only for items that remain.
 * The result is not validated yet — run the sheet through `parseCharacterFacts`.
 */
export function draftToFact(definition: AnyFieldConfig, draft: FieldDraft): FactValue | undefined {
  if (draft.state === "explicit_none") return normalizeFactInput({ explicitNone: true });
  if (draft.state === "not_applicable") return normalizeFactInput({ notApplicable: true });

  const fact = normalizeFactInput({ value: valueDraftToRaw(draft.value) });
  if (fact?.state !== "specified" || !isRepeatedKind(definition.kind)) return fact;
  if (!Array.isArray(fact.value)) return fact;

  const present = new Set((fact.value as { id: string }[]).map((item) => item.id));
  const sensitive = draft.sensitiveItemIds.filter((id) => present.has(id));
  return sensitive.length > 0 ? { ...fact, sensitiveItemIds: sensitive } : fact;
}

/** Whether a draft would store anything (used for "has content" hints, not validation). */
export function draftHasContent(definition: AnyFieldConfig, draft: FieldDraft): boolean {
  return draftToFact(definition, draft) !== undefined;
}
