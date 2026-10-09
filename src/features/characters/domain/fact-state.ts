/**
 * Mapping between UI input and the three fact states.
 *
 * | UI input                                        | Result                       |
 * |-------------------------------------------------|------------------------------|
 * | "Không áp dụng" toggled on (any value)          | `{ state: "not_applicable" }`|
 * | `undefined`, `null`, `""`, whitespace only      | unspecified (key removed)    |
 * | `[]` or a list whose items are all blank        | unspecified                  |
 * | object whose only non-blank keys are structural | unspecified                  |
 * | anything else                                   | `{ state: "specified", value }` (then validated) |
 *
 * Strings are trimmed and NFC-normalised. `false` and `0` are real values, not blanks.
 * Invalid input (e.g. `NaN` from a number box) is kept so validation reports it instead of
 * silently turning it into "unspecified".
 */
import type { CharacterFacts, FactState, FactValue } from "./types";

/**
 * Keys that describe a value's structure rather than its content. An object containing only
 * these (e.g. `{ id, text: "" }` → `{ id }`, or a measure with a unit but no number) is blank.
 */
const STRUCTURAL_KEYS = new Set(["id", "type", "unit", "approximate"]);

function cleanInput(input: unknown): unknown {
  if (input === undefined || input === null) return undefined;

  if (typeof input === "string") {
    const text = input.normalize("NFC").trim();
    return text === "" ? undefined : text;
  }

  if (Array.isArray(input)) {
    const items = input.map(cleanInput).filter((item) => item !== undefined);
    return items.length === 0 ? undefined : items;
  }

  if (typeof input === "object") {
    const entries = Object.entries(input)
      .map(([key, value]) => [key, cleanInput(value)] as const)
      .filter(([, value]) => value !== undefined);
    const hasContent = entries.some(([key]) => !STRUCTURAL_KEYS.has(key));
    return hasContent ? Object.fromEntries(entries) : undefined;
  }

  return input;
}

export type FactInput = {
  /** The "Không áp dụng" toggle. */
  notApplicable?: boolean;
  /** Raw value from the form control. */
  value?: unknown;
};

/**
 * Convert form input into a stored fact, or `undefined` for "unspecified".
 * The returned `specified` value is not yet validated — run it through the fact schema.
 */
export function normalizeFactInput(input: FactInput): FactValue | undefined {
  if (input.notApplicable) return { state: "not_applicable" };
  const value = cleanInput(input.value);
  return value === undefined ? undefined : ({ state: "specified", value } as FactValue);
}

export function getFactState(facts: Pick<CharacterFacts, "values">, key: string): FactState {
  return facts.values[key]?.state ?? "unspecified";
}
