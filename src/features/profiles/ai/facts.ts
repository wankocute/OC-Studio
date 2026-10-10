import {
  type CharacterFacts,
  type DefinitionContext,
  type FactSnapshot,
  type FieldDefinition,
  selectFactsForAi,
  canonicalJson,
  fingerprint,
  FINGERPRINT_ALGORITHM,
} from "@/features/characters/domain";
import { createFieldResolver } from "@/features/characters/domain/custom-definitions";
import { factLabelsVi } from "@/features/characters/domain/labels.vi";
import { factSourcesOf } from "../fact-sources";

type Shape = true | { [key: string]: Shape };
export type AiSnapshot = FactSnapshot & {
  aiProjection: Record<string, Shape>;
  aiDefinitionHashes?: Record<string, string>;
  aiSubfields?: Record<string, string[]>;
};

// Only keys and stable item ids survive in provenance; no fact values are stored here.
function shape(value: unknown): Shape {
  if (!value || typeof value !== "object") return true;
  if (Array.isArray(value)) {
    if (value.some((item) => !item || typeof item !== "object" || !("id" in item))) return true;
    return Object.fromEntries(value.map((item: { id: string }) => [item.id, shape(item)]));
  }
  return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, shape(entry)]));
}
function project(value: unknown, mask: Shape): unknown {
  if (mask === true) return value;
  if (Array.isArray(value)) {
    return Object.entries(mask).map(([id, child]) =>
      project(
        value.find((item: { id: string }) => item.id === id),
        child,
      ),
    );
  }
  const object = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  return Object.fromEntries(
    Object.entries(mask).map(([key, child]) => [key, project(object[key], child)]),
  );
}
export function aiSnapshot(payload: {
  displayName: string;
  sourceLanguage?: string;
  values: Record<string, unknown>;
}): AiSnapshot {
  const entries = {
    displayName: payload.displayName,
    ...(payload.sourceLanguage ? { sourceLanguage: payload.sourceLanguage } : {}),
    ...payload.values,
  };
  return {
    algorithm: FINGERPRINT_ALGORITHM,
    scope: Object.keys(entries),
    fingerprints: Object.fromEntries(
      Object.entries(entries).map(([key, value]) => [
        key,
        fingerprint(project(value, shape(value))),
      ]),
    ),
    aiProjection: Object.fromEntries(
      Object.entries(entries).map(([key, value]) => [key, shape(value)]),
    ),
  };
}
export function aiSnapshotStale(
  snapshot: AiSnapshot,
  facts: CharacterFacts,
  context: DefinitionContext = {},
): boolean {
  const entries: Record<string, unknown> = {
    displayName: facts.displayName,
    sourceLanguage: facts.sourceLanguage,
    ...facts.values,
  };
  const changed = Object.entries(snapshot.aiProjection).some(
    ([key, mask]) => fingerprint(project(entries[key], mask)) !== snapshot.fingerprints[key],
  );
  if (changed) return true;
  if (!snapshot.aiDefinitionHashes) return false;
  const sources = factSourcesOf(facts, context.library ?? { fields: [], groups: [] });
  const resolve = createFieldResolver(facts.custom, context);
  return Object.entries(snapshot.aiDefinitionHashes).some(([key, hash]) => {
    const definition = resolve(key);
    if (!definition) return true;
    const safe = { ...definition };
    if ("fields" in safe)
      safe.fields = safe.fields.filter((field) => snapshot.aiSubfields?.[key]?.includes(field.key));
    return fingerprint(labelDefinition(key, safe, sources.fieldLabels.get(key) ?? key)) !== hash;
  });
}
export function isAiSnapshot(snapshot: FactSnapshot): snapshot is AiSnapshot {
  return "aiProjection" in snapshot;
}

function labelDefinition(key: string, definition: FieldDefinition, label: string) {
  const options = factLabelsVi.options as Record<string, Record<string, string>>;
  const subfields = factLabelsVi.subfields;
  const leaf = <T extends object>(path: string, value: T) => {
    if (!("options" in value)) return value;
    const optionValues = value.options as readonly { code: string; label?: string }[];
    return {
      ...value,
      options: optionValues.map((option) => ({
        ...option,
        label: option.label ?? options[path]?.[option.code] ?? option.code,
      })),
    };
  };
  return {
    ...leaf(key, definition),
    label,
    ...("fields" in definition
      ? {
          fields: definition.fields.map((field) => ({
            ...leaf(`${key}.${field.key}`, field),
            label: field.label ?? subfields[`${key}.${field.key}`] ?? field.key,
          })),
        }
      : {}),
  };
}

export function selectSectionFacts(
  facts: CharacterFacts,
  context: DefinitionContext,
  groups: readonly string[],
  allowSensitive: readonly string[] = [],
) {
  const sources = factSourcesOf(facts, context.library ?? { fields: [], groups: [] });
  const keys = new Set(groups.flatMap((group) => [...(sources.fieldsByGroup.get(group) ?? [])]));
  const scoped = {
    ...facts,
    values: Object.fromEntries(Object.entries(facts.values).filter(([key]) => keys.has(key))),
  };
  const selection = selectFactsForAi(scoped, { allowSensitive }, context);
  const denied = selectFactsForAi(scoped, {}, context);
  const resolve = createFieldResolver(facts.custom, context);
  const payload = {
    displayName: selection.facts.displayName,
    ...(selection.facts.sourceLanguage ? { sourceLanguage: selection.facts.sourceLanguage } : {}),
    values: selection.facts.values,
    definitions: Object.fromEntries(
      Object.keys(selection.facts.values).map((key) => {
        const definition = resolve(key)!;
        // Only definitions of received sub-fields/options; descriptions are input data too.
        const safe = { ...definition };
        if ("fields" in safe) {
          const fact = selection.facts.values[key];
          const values =
            fact?.state === "specified"
              ? Array.isArray(fact.value)
                ? fact.value
                : [fact.value]
              : [];
          safe.fields = safe.fields.filter((field) =>
            values.some((value) => value && typeof value === "object" && field.key in value),
          );
        }
        return [key, labelDefinition(key, safe, sources.fieldLabels.get(key) ?? key)];
      }),
    ),
  };
  const permissions = [
    ...new Set(denied.excluded.filter((x) => x.reason === "sensitive").map((x) => x.ref)),
  ];
  const snapshot = aiSnapshot(payload);
  snapshot.aiDefinitionHashes = Object.fromEntries(
    Object.entries(payload.definitions).map(([key, definition]) => [key, fingerprint(definition)]),
  );
  snapshot.aiSubfields = Object.fromEntries(
    Object.entries(payload.definitions).map(([key, definition]) => [
      key,
      "fields" in definition ? definition.fields!.map((field) => field.key) : [],
    ]),
  );
  return { payload, json: canonicalJson(payload), permissions, snapshot };
}
