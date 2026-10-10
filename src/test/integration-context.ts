import { afterAll, beforeEach } from "vitest";

import { createDatabase } from "@/db";
import type {
  LibraryDefinitionRepository,
  LibraryFieldInput,
} from "@/features/characters/server/library-definition-repository";
import { sampleLibrary } from "@/features/characters/__tests__/fixtures/sample-characters";

import { resetTestData, resolveTestDatabaseUrl } from "./test-database";

/** A connection to the test database, wiped before each test and closed after the file. */
export function connectTestDatabase() {
  const client = createDatabase(resolveTestDatabaseUrl());
  beforeEach(() => resetTestData(client.db));
  afterAll(() => client.pool.end());
  return client;
}

/** Store the illustrative sample library definitions (versions restart at 1). */
export async function seedSampleLibrary(repository: LibraryDefinitionRepository): Promise<void> {
  for (const group of sampleLibrary.groups) await repository.createGroup(group);
  for (const [index, field] of sampleLibrary.fields.entries()) {
    const input = Object.fromEntries(
      Object.entries(field).filter(([key]) => key !== "version"),
    ) as LibraryFieldInput;
    await repository.createField(input, index);
  }
}
