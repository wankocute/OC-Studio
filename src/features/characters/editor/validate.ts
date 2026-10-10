import type { z } from "zod";

import {
  type CharacterFacts,
  createFieldResolver,
  type LibraryDefinitions,
  parseCharacterFacts,
  valueSchemaFor,
} from "@/features/characters/domain";

import { collectErrors, collectServerErrors, type EditorErrors, type KindOf } from "./errors";

function kindResolver(facts: CharacterFacts, library: LibraryDefinitions): KindOf {
  const resolve = createFieldResolver(facts.custom, { library });
  return (key) => resolve(key)?.kind;
}

/**
 * Validate the working sheet with the same domain schema the repository uses, so the editor
 * never sends a sheet the database would reject (and never claims success for one).
 *
 * The sheet schema re-reports value issues as generic "custom" issues; values are therefore
 * validated again per field to keep the original issue codes, which `issueMessage` translates.
 */
export function validateSheet(facts: CharacterFacts, library: LibraryDefinitions): EditorErrors {
  const result = parseCharacterFacts(facts, { library });
  if (result.success) return {};

  const isValueIssue = (path: readonly PropertyKey[]) =>
    path[0] === "values" && path[2] === "value";
  const issues: z.core.$ZodIssue[] = result.error.issues.filter(
    (issue) => !isValueIssue(issue.path),
  );
  const resolve = createFieldResolver(facts.custom, { library });
  for (const [key, fact] of Object.entries(facts.values)) {
    const definition = fact.state === "specified" ? resolve(key) : undefined;
    if (!definition || fact.state !== "specified") continue;
    const parsed = valueSchemaFor(definition).safeParse(fact.value);
    if (parsed.success) continue;
    for (const issue of parsed.error.issues) {
      issues.push({ ...issue, path: ["values", key, "value", ...issue.path] });
    }
  }
  return collectErrors(issues, facts, kindResolver(facts, library));
}

export function serverIssuesToErrors(
  issues: readonly { path: string; message: string }[],
  facts: CharacterFacts,
  library: LibraryDefinitions,
): EditorErrors {
  return collectServerErrors(issues, facts, kindResolver(facts, library));
}
