/**
 * Validation issues → messages placed next to the control that caused them.
 *
 * Issues from `parseCharacterFacts` point into the stored shape (`values.<key>.value.<index>…`),
 * where list indexes refer to the normalised list (blank items removed). They are translated to
 * item *ids* so an error lands on the right item no matter how the draft list is ordered.
 */
import type { z } from "zod";

import type { CharacterFacts } from "@/features/characters/domain";
import { messages } from "@/i18n";

const t = messages.editor.validation;

/** Error key of a field, a list item, or a sub-field (of an object or of a list item). */
export const errorKeys = {
  field: (fieldKey: string) => fieldKey,
  item: (fieldKey: string, itemId: string) => `${fieldKey}[${itemId}]`,
  subfield: (fieldKey: string, subKey: string, itemId?: string) =>
    itemId === undefined ? `${fieldKey}.${subKey}` : `${fieldKey}[${itemId}].${subKey}`,
};

export type EditorErrors = Record<string, string>;

type Issue = z.core.$ZodIssue;

/**
 * Domain refinements carry Vietnamese messages already; Zod's built-in ones are English, so they
 * are replaced by a Vietnamese message based on the issue code.
 */
export function issueMessage(issue: Issue): string {
  switch (issue.code) {
    case "invalid_type":
      if (issue.expected === "int") return t.integer;
      if (issue.expected === "number") return t.number;
      return issue.input === undefined ? t.required : t.invalid;
    case "too_small":
    case "too_big":
      if (issue.origin === "number" || issue.origin === "int") {
        const bound = Number(issue.code === "too_small" ? issue.minimum : issue.maximum);
        return issue.code === "too_small" ? t.min(bound) : t.max(bound);
      }
      return issue.message;
    case "invalid_union":
    case "invalid_value":
    case "invalid_format":
    case "unrecognized_keys":
      return t.invalid;
    default:
      return issue.message;
  }
}

/** Kind of a field by key (from the definitions in use), to interpret value paths. */
export type KindOf = (fieldKey: string) => string | undefined;

function errorKeyOf(path: readonly PropertyKey[], facts: CharacterFacts, kindOf: KindOf): string {
  const [root, key, part, ...rest] = path;
  if (root !== "values" || typeof key !== "string") return String(root ?? "form");
  if (part !== "value" || rest.length === 0) return errorKeys.field(key);

  const fact = facts.values[key];
  const value = fact?.state === "specified" ? (fact.value as unknown) : undefined;
  const [first, second] = rest;

  if (Array.isArray(value) && typeof first === "number") {
    const itemId = (value[first] as { id?: unknown } | undefined)?.id;
    if (typeof itemId !== "string") return errorKeys.field(key);
    // Object-list items: a sub-field error stays on the sub-field (`id`/`ref`/`text` are the item).
    if (typeof second === "string" && !["id", "text", "ref"].includes(second)) {
      return errorKeys.subfield(key, second, itemId);
    }
    return errorKeys.item(key, itemId);
  }
  if (typeof first === "string" && kindOf(key) === "object") return errorKeys.subfield(key, first);
  return errorKeys.field(key);
}

/** First message for each error key. */
export function collectErrors(
  issues: readonly Issue[],
  facts: CharacterFacts,
  kindOf: KindOf,
): EditorErrors {
  const errors: EditorErrors = {};
  for (const issue of issues) {
    errors[errorKeyOf(issue.path, facts, kindOf)] ??= issueMessage(issue);
  }
  return errors;
}

/** Errors reported by the server (paths are `values.<key>.value…` joined with dots). */
export function collectServerErrors(
  issues: readonly { path: string; message: string }[],
  facts: CharacterFacts,
  kindOf: KindOf,
): EditorErrors {
  const errors: EditorErrors = {};
  for (const issue of issues) {
    const path = issue.path.split(".").flatMap((part, index, parts) => {
      // Field keys contain one dot (`group.name`): re-join them.
      if (index === 1 && parts[0] === "values") return [`${part}.${parts[2]}`];
      if (index === 2 && parts[0] === "values") return [];
      return [/^\d+$/.test(part) ? Number(part) : part];
    });
    errors[errorKeyOf(path, facts, kindOf)] ??= issue.message;
  }
  return errors;
}

/** Whether any error belongs to the field (itself, its items or sub-fields). */
export function fieldHasErrors(errors: EditorErrors, fieldKey: string): boolean {
  return Object.keys(errors).some(
    (key) => key === fieldKey || key.startsWith(`${fieldKey}[`) || key.startsWith(`${fieldKey}.`),
  );
}
