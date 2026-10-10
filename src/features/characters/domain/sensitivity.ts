/**
 * Choosing which facts may be sent to AI (Q6).
 *
 * - Default deny: facts of `sensitive` fields are excluded, whatever their state — even
 *   "confirmed none" can be private.
 * - Permission is a per-request argument (`allowSensitive`), never read from or written to the
 *   fact sheet, so one consent is not remembered forever. Having a value is not consent.
 * - Inheritance: a sensitive field covers its whole value (all items, all sub-fields).
 *   A sensitive sub-field is stripped from every item of an otherwise shareable field; an item
 *   left with no content is dropped. Per-item sensitivity is not modelled.
 * - Facts whose definition cannot be resolved are excluded (cannot know their policy).
 */
import { createFieldResolver } from "./custom-definitions";
import { isSensitive } from "./definitions";
import { itemRef, type FactRef } from "./fingerprint";
import type {
  CharacterFacts,
  DefinitionContext,
  FactValue,
  FieldDefinition,
  ObjectItem,
  ObjectValue,
} from "./types";

export type AiFactPolicy = {
  /** Sensitive field keys the user allowed for this one request. Empty by default. */
  readonly allowSensitive?: readonly string[];
};

export type AiExclusion = {
  ref: FactRef;
  /** Set when only a sub-field was removed from the fact / item. */
  subfield?: string;
  reason: "sensitive" | "unresolved_definition";
};

export type AiFactSelection = {
  /** A copy of the sheet containing only shareable facts. */
  facts: CharacterFacts;
  excluded: AiExclusion[];
};

function stripSubfields(
  value: ObjectValue,
  sensitiveKeys: readonly string[],
): { value: ObjectValue | undefined; removed: string[] } {
  const removed = sensitiveKeys.filter((key) => value[key] !== undefined);
  if (removed.length === 0) return { value, removed };
  const next = Object.fromEntries(
    Object.entries(value).filter(([key]) => !removed.includes(key)),
  ) as ObjectValue;
  const hasContent = Object.keys(next).some((key) => key !== "id");
  return { value: hasContent ? next : undefined, removed };
}

function filterSubfields(
  definition: FieldDefinition,
  key: string,
  fact: FactValue,
  excluded: AiExclusion[],
): FactValue | undefined {
  if (fact.state !== "specified" || !("fields" in definition)) return fact;
  const sensitiveKeys = definition.fields.filter(isSensitive).map((subfield) => subfield.key);
  if (sensitiveKeys.length === 0) return fact;

  if (definition.kind === "object") {
    const { value, removed } = stripSubfields(fact.value as ObjectValue, sensitiveKeys);
    for (const subfield of removed) excluded.push({ ref: key, subfield, reason: "sensitive" });
    if (value === undefined) {
      excluded.push({ ref: key, reason: "sensitive" });
      return undefined;
    }
    return { state: "specified", value };
  }

  const items: ObjectItem[] = [];
  for (const item of fact.value as ObjectItem[]) {
    const ref = itemRef(key, item.id);
    const { value, removed } = stripSubfields(item, sensitiveKeys);
    for (const subfield of removed) excluded.push({ ref, subfield, reason: "sensitive" });
    if (value === undefined) excluded.push({ ref, reason: "sensitive" });
    else items.push(value as ObjectItem);
  }
  return items.length > 0 ? { state: "specified", value: items } : undefined;
}

/**
 * Select the facts that may be given to AI under `policy`. Pure; the input is not mutated.
 * Pass the same `context` (library definitions) used for validation.
 */
export function selectFactsForAi(
  facts: CharacterFacts,
  policy: AiFactPolicy = {},
  context: DefinitionContext = {},
): AiFactSelection {
  const allowed = new Set(policy.allowSensitive ?? []);
  const resolve = createFieldResolver(facts.custom, context);
  const excluded: AiExclusion[] = [];
  const values: CharacterFacts["values"] = {};

  for (const [key, fact] of Object.entries(facts.values)) {
    const definition = resolve(key);
    if (!definition) {
      excluded.push({ ref: key, reason: "unresolved_definition" });
      continue;
    }
    if (allowed.has(key)) {
      values[key] = fact;
      continue;
    }
    if (isSensitive(definition)) {
      excluded.push({ ref: key, reason: "sensitive" });
      continue;
    }
    const filtered = filterSubfields(definition, key, fact, excluded);
    if (filtered) values[key] = filtered;
  }

  const keptCustom = facts.custom && {
    groups: facts.custom.groups,
    fields: facts.custom.fields.filter((definition) => definition.key in values),
  };
  const selected: CharacterFacts = { ...facts, values };
  if (keptCustom) selected.custom = keptCustom;
  return { facts: selected, excluded };
}
