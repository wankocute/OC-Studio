/**
 * Fact references and content fingerprints — the basis for traceability and staleness.
 *
 * A *fact ref* is a stable address:
 * - `displayName`
 * - `<fieldKey>`                    e.g. `identity.age`
 * - `<fieldKey>[<itemId>]`          e.g. `appearance.tattoos[t_1]` (repeated elements)
 *
 * A *fingerprint* is a hash of the canonical JSON of the fact at that address.
 * Generated content (later tasks) stores `{ ref → fingerprint }` for the facts it used;
 * comparing with current fingerprints tells which facts changed or were removed.
 *
 * Item fingerprints exclude position, so reordering a list changes only the field-level
 * fingerprint (whose value includes order), not the items'.
 *
 * Not a security hash: it only needs to detect edits. Values carry an algorithm prefix so the
 * function can be swapped later without misreading old fingerprints.
 */
import { findFieldDefinition } from "./schemas";
import type { CharacterFacts, FactValue } from "./types";

export type FactRef = string;
export type FactFingerprints = Record<FactRef, string>;

export const DISPLAY_NAME_REF = "displayName";

export function fieldRef(fieldKey: string): FactRef {
  return fieldKey;
}

export function itemRef(fieldKey: string, itemId: string): FactRef {
  return `${fieldKey}[${itemId}]`;
}

/** Deterministic JSON: object keys sorted, strings NFC-normalised, `undefined` dropped. */
export function canonicalJson(value: unknown): string {
  if (value === undefined) return "null";
  if (typeof value === "string") return JSON.stringify(value.normalize("NFC"));
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;

  const entries = Object.entries(value)
    .filter(([, entry]) => entry !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`);
  return `{${entries.join(",")}}`;
}

/** cyrb53: fast 53-bit string hash, identical in browser and Node. */
function cyrb53(text: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(14, "0");
}

export function fingerprint(value: unknown): string {
  return `c53:${cyrb53(canonicalJson(value))}`;
}

const REPEATED_KINDS = new Set(["text_list", "character_ref_list", "object_list"]);

function itemsOf(fact: FactValue): readonly { id: string }[] {
  return fact.state === "specified" && Array.isArray(fact.value)
    ? (fact.value as { id: string }[])
    : [];
}

/**
 * Fingerprint every addressable fact of a sheet. Unspecified facts have no entry.
 * Assumes the sheet passed validation (item ids are unique).
 */
export function computeFactFingerprints(facts: CharacterFacts): FactFingerprints {
  const result: FactFingerprints = { [DISPLAY_NAME_REF]: fingerprint(facts.displayName) };

  for (const [key, fact] of Object.entries(facts.values)) {
    result[fieldRef(key)] = fingerprint(fact);

    const definition = findFieldDefinition(key, facts.custom);
    if (!definition || !REPEATED_KINDS.has(definition.kind)) continue;
    for (const item of itemsOf(fact)) {
      result[itemRef(key, item.id)] = fingerprint(item);
    }
  }
  return result;
}

export type FactChanges = { added: FactRef[]; changed: FactRef[]; removed: FactRef[] };

export function diffFactFingerprints(
  before: FactFingerprints,
  after: FactFingerprints,
): FactChanges {
  const changes: FactChanges = { added: [], changed: [], removed: [] };
  for (const [ref, hash] of Object.entries(after)) {
    if (!(ref in before)) changes.added.push(ref);
    else if (before[ref] !== hash) changes.changed.push(ref);
  }
  for (const ref of Object.keys(before)) {
    if (!(ref in after)) changes.removed.push(ref);
  }
  return changes;
}

/**
 * Facts a piece of generated content relied on that have since changed or disappeared.
 * Non-empty result ⇒ the content may be outdated.
 */
export function findStaleRefs(used: FactFingerprints, current: FactFingerprints): FactRef[] {
  return Object.entries(used)
    .filter(([ref, hash]) => current[ref] !== hash)
    .map(([ref]) => ref);
}
