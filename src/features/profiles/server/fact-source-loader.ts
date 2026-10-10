import "server-only";

import type { Database } from "@/db";
import { createCharacterRepository } from "@/features/characters/server/character-repository";
import { createLibraryDefinitionRepository } from "@/features/characters/server/library-definition-repository";
import { factSourcesOf } from "@/features/profiles/fact-sources";

/** The character (current sheet) and the fact groups/fingerprints its profile is written from. */
export async function loadFactSources(db: Database, characterId: string) {
  const definitions = createLibraryDefinitionRepository(db);
  const [character, library, fields] = await Promise.all([
    createCharacterRepository(db).getById(characterId),
    definitions.load(),
    definitions.listFields(),
  ]);
  const deprecated = new Set(
    fields.filter((field) => field.status === "deprecated").map((field) => field.definition.key),
  );
  return { character, sources: factSourcesOf(character.facts, library, deprecated) };
}
