/**
 * Choosing which facts may be sent to AI (Q6, SEN-01, SEN-02).
 *
 * - Default deny: facts of `sensitive` fields are excluded, whatever their state — even
 *   "confirmed none" can be private.
 * - Permission is a per-request argument (`allowSensitive`), never read from or written to the
 *   fact sheet, so one consent is not remembered forever. Having a value is not consent.
 * - Three levels, from the outside in:
 *   1. field (`sensitivity` on the definition) — covers the whole value, every item and sub-field;
 *   2. item (`sensitiveItemIds` on the fact)   — removes that element of a list;
 *   3. sub-field (`sensitivity` on a sub-field definition) — stripped from every item.
 *   A field permission (`"history.events"`) unlocks the field and all its items and sub-fields.
 *   An item permission (`"history.events[evt_1]"`) unlocks only that item, and only when the
 *   field itself is not sensitive (the parent's protection always applies first).
 * - Output never carries privacy metadata (`sensitiveItemIds` is removed).
 * - Facts whose definition cannot be resolved are excluded (cannot know their policy).
 */
import { createFieldResolver } from "./custom-definitions";
import { isRepeatedKind, isSensitive } from "./definitions";
import { fieldKeyOfRef, itemRef, type FactRef } from "./fingerprint";
import type {
  CharacterFacts,
  DefinitionContext,
  FactValue,
  FieldDefinition,
  ObjectItem,
  ObjectValue,
} from "./types";

export type AiFactPolicy = {
  /**
   * Sensitive facts the user allowed for this one request: field keys (`psychology.wounds`)
   * and/or item refs (`history.events[evt_1]`). Empty by default.
   */
  readonly allowSensitive?: readonly FactRef[];
};

export type AiExclusion = {
  ref: FactRef;
  /** Set when only a sub-field was removed from the fact / item. */
  subfield?: string;
  reason: "sensitive" | "unresolved_definition";
};

export type AiFactSelection = {
  /** A copy of the sheet containing only shareable facts, without privacy metadata. */
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

function sensitiveSubfieldKeys(definition: FieldDefinition): string[] {
  return "fields" in definition
    ? definition.fields.filter(isSensitive).map((subfield) => subfield.key)
    : [];
}

/** Apply item- and sub-field-level policy to a fact of a non-sensitive (or allowed) field. */
function filterFact(
  definition: FieldDefinition,
  key: string,
  fact: FactValue,
  allowed: ReadonlySet<string>,
  excluded: AiExclusion[],
): FactValue | undefined {
  if (fact.state !== "specified") return fact;
  const fieldAllowed = allowed.has(key);
  const subfieldKeys = fieldAllowed ? [] : sensitiveSubfieldKeys(definition);

  if (definition.kind === "object") {
    const { value, removed } = stripSubfields(fact.value as ObjectValue, subfieldKeys);
    for (const subfield of removed) excluded.push({ ref: key, subfield, reason: "sensitive" });
    if (value === undefined) {
      excluded.push({ ref: key, reason: "sensitive" });
      return undefined;
    }
    return { state: "specified", value };
  }

  if (!isRepeatedKind(definition.kind)) return { state: "specified", value: fact.value };

  const sensitiveItems = new Set(fact.sensitiveItemIds ?? []);
  const items: { id: string }[] = [];
  for (const item of fact.value as { id: string }[]) {
    const ref = itemRef(key, item.id);
    if (sensitiveItems.has(item.id) && !fieldAllowed && !allowed.has(ref)) {
      excluded.push({ ref, reason: "sensitive" });
      continue;
    }
    if (definition.kind !== "object_list") {
      items.push(item);
      continue;
    }
    const { value, removed } = stripSubfields(item as ObjectItem, subfieldKeys);
    for (const subfield of removed) excluded.push({ ref, subfield, reason: "sensitive" });
    if (value === undefined) excluded.push({ ref, reason: "sensitive" });
    else items.push(value as ObjectItem);
  }
  if (items.length === 0) {
    excluded.push({ ref: key, reason: "sensitive" });
    return undefined;
  }
  return { state: "specified", value: items } as FactValue;
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
    if (isSensitive(definition) && !allowed.has(key)) {
      excluded.push({ ref: key, reason: "sensitive" });
      continue;
    }
    const filtered = filterFact(definition, key, fact, allowed, excluded);
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

/**
 * Which of `refs` (e.g. the facts a generated section used) are sensitive *now*. Privacy
 * metadata does not change fingerprints, so this is how content that relied on a fact which
 * was later marked sensitive gets flagged for review. A field ref counts as sensitive when the
 * field, any of its items or any of its sub-fields is sensitive.
 */
export function findSensitiveRefs(
  refs: readonly FactRef[],
  facts: CharacterFacts,
  context: DefinitionContext = {},
): FactRef[] {
  const resolve = createFieldResolver(facts.custom, context);
  return refs.filter((ref) => {
    const key = fieldKeyOfRef(ref);
    const definition = resolve(key);
    if (!definition) return false;
    if (isSensitive(definition)) return true;
    const fact = facts.values[key];
    const sensitiveItems = fact?.state === "specified" ? (fact.sensitiveItemIds ?? []) : [];
    const hasSensitiveSubfields = sensitiveSubfieldKeys(definition).length > 0;
    if (ref === key) return sensitiveItems.length > 0 || hasSensitiveSubfields;
    const itemId = ref.slice(key.length + 1, -1);
    return sensitiveItems.includes(itemId) || hasSensitiveSubfields;
  });
}
