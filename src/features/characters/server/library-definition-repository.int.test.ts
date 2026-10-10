import { describe, expect, it } from "vitest";

import { isRepositoryError, type RepositoryErrorCode } from "@/db/repository-errors";
import {
  SAMPLE_CHARACTER_IDS,
  sampleContemporary,
  sampleLibrary,
  sampleMinimal,
} from "@/features/characters/__tests__/fixtures/sample-characters";
import { seedSampleLibrary, connectTestDatabase } from "@/test/integration-context";

import { createCharacterRepository } from "./character-repository";
import {
  createLibraryDefinitionRepository,
  type LibraryFieldInput,
} from "./library-definition-repository";

const { db } = connectTestDatabase();
const repository = createLibraryDefinitionRepository(db);
const characterRepository = createCharacterRepository(db);

async function expectError(promise: Promise<unknown>, code: RepositoryErrorCode) {
  const error = await promise.then(
    () => undefined,
    (caught: unknown) => caught,
  );
  expect(isRepositoryError(error, code), `expected ${code}, got ${String(error)}`).toBe(true);
  return error as { details: Record<string, unknown> };
}

const zodiac = sampleLibrary.fields.find((field) => field.key === "lib.zodiac")!;
if (zodiac.kind !== "single_select") throw new Error("fixture changed");
const zodiacBody = Object.fromEntries(
  Object.entries(zodiac).filter(([key]) => key !== "version" && key !== "key"),
) as Omit<typeof zodiac, "version" | "key">;

describe("library definitions", () => {
  it("stores and loads definitions with repository-managed versions", async () => {
    await seedSampleLibrary(repository);
    const library = await repository.load();
    expect(library.groups).toEqual(sampleLibrary.groups);
    expect(library.fields.map((field) => [field.key, field.version])).toEqual([
      ["lib.zodiac", 1],
      ["lib.secret", 1],
    ]);
    expect(library.fields[0]).toEqual({ ...zodiac, version: 1 });
  });

  it("rejects invalid definitions and duplicate keys", async () => {
    await seedSampleLibrary(repository);
    await expectError(
      repository.createField({
        ...zodiacBody,
        key: "lib.no_label",
        label: "",
      } as LibraryFieldInput),
      "validation_failed",
    );
    await expectError(
      repository.createField({ ...zodiacBody, key: "lib.zodiac" } as LibraryFieldInput),
      "validation_failed",
    );
    await expectError(
      repository.createField({
        key: "custom.wrong_scope",
        group: "identity",
        label: "Sai",
        kind: "short_text",
      } as LibraryFieldInput),
      "validation_failed",
    );
  });

  it("accepts compatible edits and bumps the version", async () => {
    await seedSampleLibrary(repository);
    const updated = await repository.updateField(
      "lib.zodiac",
      {
        ...zodiacBody,
        label: "Tuổi âm lịch",
        options: [...zodiac.options, { code: "dragon", label: "Thìn" }],
      },
      1,
    );
    expect(updated.definition.version).toBe(2);
    expect(updated.definition.label).toBe("Tuổi âm lịch");
  });

  it("rejects breaking edits and keeps the stored definition", async () => {
    await seedSampleLibrary(repository);
    const error = await expectError(
      repository.updateField("lib.zodiac", { ...zodiacBody, options: zodiac.options.slice(1) }, 1),
      "definition_breaking_change",
    );
    expect(error.details).toEqual({
      key: "lib.zodiac",
      changes: [{ path: "options.rat", reason: "option_removed" }],
    });
    await expectError(
      repository.updateField("lib.zodiac", { ...zodiacBody, kind: "short_text" } as never, 1),
      "definition_breaking_change",
    );
    expect((await repository.load()).fields[0]).toEqual({ ...zodiac, version: 1 });
  });

  it("rejects edits based on a stale version", async () => {
    await seedSampleLibrary(repository);
    await repository.updateField("lib.zodiac", { ...zodiacBody, label: "A" }, 1);
    await expectError(
      repository.updateField("lib.zodiac", { ...zodiacBody, label: "B" }, 1),
      "revision_conflict",
    );
  });

  it("deprecates without removing, so characters using the field still validate", async () => {
    await seedSampleLibrary(repository);
    await characterRepository.create(sampleMinimal, { id: SAMPLE_CHARACTER_IDS.minimal });
    const ngoc = await characterRepository.create(sampleContemporary);
    const record = await repository.deprecateField("lib.zodiac");
    expect(record.status).toBe("deprecated");
    expect(record.deprecatedAt).toBeInstanceOf(Date);
    expect((await repository.load()).fields.map((field) => field.key)).toContain("lib.zodiac");
    expect((await characterRepository.getById(ngoc.id)).facts.values["lib.zodiac"]).toEqual(
      sampleContemporary.values["lib.zodiac"],
    );
  });

  it("never deletes a definition that is used or deprecated", async () => {
    await seedSampleLibrary(repository);
    await characterRepository.create(sampleMinimal, { id: SAMPLE_CHARACTER_IDS.minimal });
    const ngoc = await characterRepository.create(sampleContemporary);
    await expectError(repository.deleteUnusedField("lib.zodiac"), "definition_in_use");

    // Still "used" after the character is soft-deleted: it could be restored.
    await characterRepository.softDelete(ngoc.id, 1);
    await expectError(repository.deleteUnusedField("lib.zodiac"), "definition_in_use");

    await repository.createField({ ...zodiacBody, key: "lib.unused_field" } as LibraryFieldInput);
    await repository.deprecateField("lib.unused_field");
    await expectError(repository.deleteUnusedField("lib.unused_field"), "definition_deprecated");
  });

  it("deletes an unused active definition", async () => {
    await seedSampleLibrary(repository);
    await repository.createField({ ...zodiacBody, key: "lib.draft_field" } as LibraryFieldInput);
    await repository.deleteUnusedField("lib.draft_field");
    expect((await repository.load()).fields.map((field) => field.key)).not.toContain(
      "lib.draft_field",
    );
  });
});
