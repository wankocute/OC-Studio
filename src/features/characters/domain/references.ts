/**
 * Character references across a fact sheet: built-in relationships, history events and any
 * custom/library field of kind `character_ref` / `character_ref_list` (also inside objects).
 *
 * Q4 — reverse relationships are only *suggested*: never created, typed or assumed symmetric.
 * Q5 — when a library character is deleted, references to it become `unlinked` with the name at
 *      that moment and a `detachedFrom` record; everything else in the relationship is kept.
 */
import { createFieldResolver } from "./custom-definitions";
import { itemRef, type FactRef } from "./fingerprint";
import type {
  CharacterFacts,
  CharacterRef,
  CharacterRefItem,
  DefinitionContext,
  FactValue,
  FieldDefinition,
  LeafConfig,
  ObjectItem,
  ObjectValue,
} from "./types";

type RefMapper = (ref: CharacterRef, at: FactRef) => CharacterRef;

/**
 * `at` is the fact ref holding the reference. Refs nested inside an object item are reported at
 * the item (`history.events[evt_1]`): tracing stops at item level (Q10).
 */
function mapLeaf(
  kind: LeafConfig["kind"],
  value: unknown,
  at: FactRef,
  map: RefMapper,
  nested = false,
): unknown {
  if (kind === "character_ref") return map(value as CharacterRef, at);
  if (kind === "character_ref_list") {
    return (value as CharacterRefItem[]).map((item) => ({
      ...item,
      ref: map(item.ref, nested ? at : itemRef(at, item.id)),
    }));
  }
  return value;
}

function mapObject(
  definition: Extract<FieldDefinition, { fields: unknown }>,
  value: ObjectValue,
  at: FactRef,
  map: RefMapper,
): ObjectValue {
  const next: ObjectValue = { ...value };
  for (const subfield of definition.fields) {
    const subValue = value[subfield.key];
    if (subValue !== undefined) {
      next[subfield.key] = mapLeaf(subfield.kind, subValue, at, map, true) as ObjectValue[string];
    }
  }
  return next;
}

function mapFact(definition: FieldDefinition, key: string, fact: FactValue, map: RefMapper) {
  if (fact.state !== "specified") return fact;
  let value: unknown;
  switch (definition.kind) {
    case "object":
      value = mapObject(definition, fact.value as ObjectValue, key, map);
      break;
    case "object_list":
      value = (fact.value as ObjectItem[]).map(
        (item) => mapObject(definition, item, itemRef(key, item.id), map) as ObjectItem,
      );
      break;
    default:
      value = mapLeaf(definition.kind, fact.value, key, map);
  }
  // Keep the rest of the envelope (e.g. sensitiveItemIds): only the content changes.
  return { ...fact, value } as FactValue;
}

/** Visit every character reference; `map` may return a replacement. Returns a new sheet. */
function mapCharacterRefs(
  facts: CharacterFacts,
  context: DefinitionContext,
  map: RefMapper,
): CharacterFacts {
  const resolve = createFieldResolver(facts.custom, context);
  const values: CharacterFacts["values"] = {};
  for (const [key, fact] of Object.entries(facts.values)) {
    const definition = resolve(key);
    values[key] = definition ? mapFact(definition, key, fact, map) : fact;
  }
  return { ...facts, values };
}

export type LinkedReference = { characterId: string; at: FactRef };

/** Every reference to a library character, with the fact ref (field or item) it sits in. */
export function collectLinkedReferences(
  facts: CharacterFacts,
  context: DefinitionContext = {},
): LinkedReference[] {
  const found: LinkedReference[] = [];
  mapCharacterRefs(facts, context, (ref, at) => {
    if (ref.type === "character") found.push({ characterId: ref.characterId, at });
    return ref;
  });
  return found;
}

export type DeletedCharacter = {
  characterId: string;
  /** The deleted character's display name at deletion time. */
  displayName: string;
};

/**
 * Convert references to a deleted character into `unlinked` ones. Pure: returns a new sheet and
 * the refs that changed; the input is not mutated. `at` is the deletion time (ISO 8601) — passed
 * in so the result is deterministic. Other characters with the same name are never linked.
 */
export function detachDeletedCharacter(
  facts: CharacterFacts,
  deleted: DeletedCharacter,
  at: string,
  context: DefinitionContext = {},
): { facts: CharacterFacts; detached: FactRef[] } {
  const detached: FactRef[] = [];
  const next = mapCharacterRefs(facts, context, (ref, where) => {
    if (ref.type !== "character" || ref.characterId !== deleted.characterId) return ref;
    detached.push(where);
    return {
      type: "unlinked",
      name: deleted.displayName,
      detachedFrom: { characterId: deleted.characterId, reason: "character_deleted", at },
    };
  });
  return { facts: detached.length > 0 ? next : facts, detached };
}

// ---------------------------------------------------------------------------
// Reverse relationship suggestions (Q4)
// ---------------------------------------------------------------------------

const RELATIONSHIPS_KEY = "relationships.entries";

export type CharacterWithFacts = { characterId: string; facts: CharacterFacts };

export type ReverseRelationshipSuggestion = {
  /** Character that already has the relationship. */
  fromCharacterId: string;
  /** Relationship item in the source sheet the suggestion is based on. */
  fromItemId: string;
  /** Character that could get a relationship back to `fromCharacterId`. */
  toCharacterId: string;
};

function relationshipItems(facts: CharacterFacts): ObjectItem[] {
  const fact = facts.values[RELATIONSHIPS_KEY];
  return fact?.state === "specified" ? (fact.value as ObjectItem[]) : [];
}

function linksTo(item: ObjectItem, characterId: string): boolean {
  const person = item.person as CharacterRef | undefined;
  return person?.type === "character" && person.characterId === characterId;
}

/**
 * Suggest adding a relationship on `target` pointing back at `source`, when `source` links to
 * `target` and `target` has no relationship to `source` yet. The suggestion carries no type,
 * status or description — the user enters those; nothing is inferred or created here.
 */
export function suggestReverseRelationships(
  source: CharacterWithFacts,
  target: CharacterWithFacts,
): ReverseRelationshipSuggestion[] {
  if (source.characterId === target.characterId) return [];
  const targetLinksBack = relationshipItems(target.facts).some((item) =>
    linksTo(item, source.characterId),
  );
  if (targetLinksBack) return [];
  return relationshipItems(source.facts)
    .filter((item) => linksTo(item, target.characterId))
    .map((item) => ({
      fromCharacterId: source.characterId,
      fromItemId: item.id,
      toCharacterId: target.characterId,
    }));
}
