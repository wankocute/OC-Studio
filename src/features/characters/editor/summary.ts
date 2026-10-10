/**
 * Short, read-only text for a stored fact (legacy fields, review items, hidden-data notices).
 * Uses the same labels as the editor; never used to write data.
 */
import {
  type CharacterRef,
  type Choice,
  factLabelsVi,
  type FactValue,
  type FieldDefinition,
  type FlexibleDate,
  type LeafConfig,
  type Measure,
} from "@/features/characters/domain";
import { messages } from "@/i18n";

import { optionLabel, unitLabel } from "./layout";

const t = messages.editor.inputs;

function refText(ref: CharacterRef, nameOf: (id: string) => string | undefined): string {
  return ref.type === "character"
    ? (nameOf(ref.characterId) ?? messages.editor.refs.missing)
    : ref.name;
}

function choiceText(
  path: string,
  config: Extract<LeafConfig, { options: unknown }>,
  choice: Choice,
) {
  if ("other" in choice) return choice.other;
  const option = config.options.find((candidate) => candidate.code === choice.option);
  return option ? optionLabel(path, option) : choice.option;
}

function dateText(date: FlexibleDate): string {
  if (date.type === "text") return date.text;
  const parts = [date.day, date.month, date.year].filter((part) => part !== undefined);
  return `${date.approximate ? `${t.approximate.toLowerCase()} ` : ""}${parts.join("/")}`;
}

function leafText(
  path: string,
  config: LeafConfig,
  value: unknown,
  nameOf: (id: string) => string | undefined,
): string {
  switch (config.kind) {
    case "short_text":
    case "long_text":
      return String(value);
    case "number":
      return String(value);
    case "measure": {
      const measure = value as Measure;
      const prefix = measure.approximate ? `${t.approximate.toLowerCase()} ` : "";
      return `${prefix}${measure.value} ${unitLabel(measure.unit)}`;
    }
    case "boolean":
      return value ? t.yes : t.no;
    case "date":
      return dateText(value as FlexibleDate);
    case "single_select":
      return choiceText(path, config, value as Choice);
    case "multi_select":
      return (value as Choice[]).map((choice) => choiceText(path, config, choice)).join(", ");
    case "text_list":
      return (value as { text: string }[]).map((item) => item.text).join(", ");
    case "character_ref":
      return refText(value as CharacterRef, nameOf);
    case "character_ref_list":
      return (value as { ref: CharacterRef }[]).map((item) => refText(item.ref, nameOf)).join(", ");
  }
}

export function summarizeFact(
  definition: FieldDefinition,
  fact: FactValue | undefined,
  nameOf: (id: string) => string | undefined = () => undefined,
): string {
  if (!fact) return factLabelsVi.states.unspecified;
  if (fact.state === "explicit_none") return factLabelsVi.states.explicit_none;
  if (fact.state === "not_applicable") return factLabelsVi.states.not_applicable;
  if (definition.kind === "object" || definition.kind === "object_list") {
    const items = definition.kind === "object" ? [fact.value] : (fact.value as unknown[]);
    return t.itemCount(items.length);
  }
  return leafText(definition.key, definition, fact.value, nameOf);
}
