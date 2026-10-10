/**
 * Fact references and content fingerprints — the basis for traceability and staleness (Q10).
 *
 * A *fact ref* is a stable address:
 * - `displayName`
 * - `<fieldKey>`                    e.g. `identity.age`
 * - `<fieldKey>[<itemId>]`          e.g. `appearance.tattoos[t_1]` (repeated elements)
 * Tracing stops at item level; sub-fields are not addressed separately.
 *
 * A *fingerprint* is `<algorithm>:<hash>` of the canonical JSON of the fact at that address.
 * For character- and library-scoped fields the hash also covers the definition's meaning
 * (label, description, kind, options…), because users read custom labels as part of the fact.
 * Built-in labels are translations, so they are not included.
 *
 * Fingerprints are for change detection only — not a security hash. Fingerprints made by a
 * different algorithm are never compared as if equal or different: they are "incomparable".
 */
import { createFieldResolver, fieldScopeOf } from "./custom-definitions";
import { isRepeatedKind } from "./definitions";
import type { CharacterFacts, DefinitionContext, FactValue, FieldDefinition } from "./types";

export type FactRef = string;
export type FactFingerprints = Record<FactRef, string>;

/** Current algorithm id: cyrb53 over canonical JSON (sorted keys, NFC strings). */
export const FINGERPRINT_ALGORITHM = "c53";

export const DISPLAY_NAME_REF = "displayName";

export function fieldRef(fieldKey: string): FactRef {
  return fieldKey;
}

export function itemRef(fieldKey: string, itemId: string): FactRef {
  return `${fieldKey}[${itemId}]`;
}

/** Field key of a ref (`appearance.tattoos[t_1]` → `appearance.tattoos`). */
export function fieldKeyOfRef(ref: FactRef): string {
  const bracket = ref.indexOf("[");
  return bracket === -1 ? ref : ref.slice(0, bracket);
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
  return `${FINGERPRINT_ALGORITHM}:${cyrb53(canonicalJson(value))}`;
}

/** Algorithm id of a fingerprint (`c53:…` → `c53`). */
export function fingerprintAlgorithm(value: string): string {
  const colon = value.indexOf(":");
  return colon === -1 ? "" : value.slice(0, colon);
}

/** Definition properties that do not change what a value means (placement, policy, bookkeeping). */
const NON_SEMANTIC_KEYS = new Set(["group", "version", "sensitivity"]);

function withoutNonSemanticKeys(definition: object): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(definition).filter(([key]) => !NON_SEMANTIC_KEYS.has(key)),
  );
}

/** The parts of a custom/library definition that change what a value means. */
function definitionSemantics(definition: FieldDefinition): unknown {
  const semantic = withoutNonSemanticKeys(definition);
  if ("fields" in definition) semantic.fields = definition.fields.map(withoutNonSemanticKeys);
  return semantic;
}

/**
 * The content part of a fact: privacy metadata (`sensitiveItemIds`) is not part of what the fact
 * says, so marking an item sensitive does not make content outdated. Use `findSensitiveRefs`
 * to detect content that relied on facts which have since become sensitive.
 */
function factContent(fact: FactValue): unknown {
  return fact.state === "specified" ? { state: fact.state, value: fact.value } : fact;
}

function itemsOf(fact: FactValue): readonly { id: string }[] {
  return fact.state === "specified" && Array.isArray(fact.value)
    ? (fact.value as { id: string }[])
    : [];
}

/**
 * Fingerprint every addressable fact of a sheet. Unspecified facts have no entry, so a fact that
 * later gets a value shows up as `added`. Assumes the sheet passed validation (unique item ids).
 * Pass the same `context` (library definitions) used for validation.
 */
export function computeFactFingerprints(
  facts: CharacterFacts,
  context: DefinitionContext = {},
): FactFingerprints {
  const result: FactFingerprints = { [DISPLAY_NAME_REF]: fingerprint(facts.displayName) };
  const resolve = createFieldResolver(facts.custom, context);

  for (const [key, fact] of Object.entries(facts.values)) {
    const definition = resolve(key);
    const semantic =
      definition && fieldScopeOf(key) !== "builtin" ? definitionSemantics(definition) : undefined;
    const withDefinition = (content: unknown) =>
      semantic === undefined ? content : { content, definition: semantic };

    result[fieldRef(key)] = fingerprint(withDefinition(factContent(fact)));

    if (!definition || !isRepeatedKind(definition.kind)) continue;
    for (const item of itemsOf(fact)) {
      result[itemRef(key, item.id)] = fingerprint(withDefinition(item));
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
 * Facts a piece of generated content relied on that changed or disappeared since.
 * Fingerprints from another algorithm cannot be compared, so they are reported too
 * (conservative: re-check rather than assume unchanged). Non-empty ⇒ possibly outdated.
 */
export function findStaleRefs(used: FactFingerprints, current: FactFingerprints): FactRef[] {
  return Object.entries(used)
    .filter(([ref, hash]) => {
      const now = current[ref];
      return (
        now === undefined ||
        fingerprintAlgorithm(hash) !== fingerprintAlgorithm(now) ||
        now !== hash
      );
    })
    .map(([ref]) => ref);
}

// ---------------------------------------------------------------------------
// Snapshots: what a piece of generated content was given
// ---------------------------------------------------------------------------

/**
 * Record of the facts handed to a generator: the scope (field keys, plus `displayName` if used)
 * and the fingerprints of every fact in that scope at that time.
 */
export type FactSnapshot = {
  algorithm: string;
  /** Field-level refs the content was allowed to use, e.g. `["displayName", "appearance.height"]`. */
  scope: FactRef[];
  fingerprints: FactFingerprints;
};

function inScope(ref: FactRef, scope: ReadonlySet<string>): boolean {
  return scope.has(fieldKeyOfRef(ref));
}

export function createFactSnapshot(
  current: FactFingerprints,
  scope: readonly FactRef[],
): FactSnapshot {
  const scopeSet = new Set(scope);
  const fingerprints = Object.fromEntries(
    Object.entries(current).filter(([ref]) => inScope(ref, scopeSet)),
  );
  return { algorithm: FINGERPRINT_ALGORITHM, scope: [...scope], fingerprints };
}

export type SnapshotAssessment =
  | { status: "fresh" }
  | { status: "outdated"; changed: FactRef[]; removed: FactRef[]; added: FactRef[] }
  /** Snapshot made with another fingerprint algorithm: recompute, do not compare. */
  | { status: "incomparable"; snapshotAlgorithm: string };

/**
 * Compare a snapshot with the current fingerprints. Besides changed/removed facts, facts that
 * entered the snapshot's scope later (`added`) also make the content outdated — e.g. the user
 * filled in eye colour after an appearance paragraph was written.
 */
export function assessFactSnapshot(
  snapshot: FactSnapshot,
  current: FactFingerprints,
): SnapshotAssessment {
  if (snapshot.algorithm !== FINGERPRINT_ALGORITHM) {
    return { status: "incomparable", snapshotAlgorithm: snapshot.algorithm };
  }
  const scope = new Set(snapshot.scope);
  const now = Object.fromEntries(Object.entries(current).filter(([ref]) => inScope(ref, scope)));
  const { added, changed, removed } = diffFactFingerprints(snapshot.fingerprints, now);
  return added.length + changed.length + removed.length === 0
    ? { status: "fresh" }
    : { status: "outdated", changed, removed, added };
}
