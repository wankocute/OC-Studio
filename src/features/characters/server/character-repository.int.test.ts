import { eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { isRepositoryError, type RepositoryErrorCode } from "@/db/repository-errors";
import { characterReferences, characters } from "@/db/schema";
import {
  type CharacterFacts,
  CHARACTER_FACTS_SCHEMA_VERSION,
  collectLinkedReferences,
} from "@/features/characters/domain";
import { v1Contemporary } from "@/features/characters/__tests__/fixtures/historical-v1";
import {
  SAMPLE_CHARACTER_IDS,
  sampleContemporary,
  sampleContext,
  sampleFantasy,
  sampleMinimal,
} from "@/features/characters/__tests__/fixtures/sample-characters";
import { seedSampleLibrary, connectTestDatabase } from "@/test/integration-context";

import { createCharacterRepository } from "./character-repository";
import { createLibraryDefinitionRepository } from "./library-definition-repository";

const { db } = connectTestDatabase();
const repository = createCharacterRepository(db);
const libraryRepository = createLibraryDefinitionRepository(db);

async function expectError(promise: Promise<unknown>, code: RepositoryErrorCode) {
  const error = await promise.then(
    () => undefined,
    (caught: unknown) => caught,
  );
  expect(isRepositoryError(error, code), `expected ${code}, got ${String(error)}`).toBe(true);
  return error as { code: string; details: Record<string, unknown> };
}

/** Khải (minimal) is referenced by Ngọc (contemporary) twice: an event and a relationship. */
async function seedPair() {
  await seedSampleLibrary(libraryRepository);
  const khai = await repository.create(sampleMinimal, { id: SAMPLE_CHARACTER_IDS.minimal });
  const ngoc = await repository.create(sampleContemporary, {
    id: SAMPLE_CHARACTER_IDS.contemporary,
  });
  return { khai, ngoc };
}

async function referenceRows() {
  return db.select().from(characterReferences).orderBy(characterReferences.factRef);
}

/** No index row or stored linked ref may point at a deleted or missing character. */
async function expectNoDanglingReferences() {
  const dangling = await db.execute(sql`
    select r.* from character_references r
    left join characters c on c.id = r.target_character_id
    where c.id is null or c.deleted_at is not null`);
  expect(dangling.rows).toEqual([]);

  const active = new Set(
    (
      await db
        .select({ id: characters.id })
        .from(characters)
        .where(sql`deleted_at is null`)
    ).map((row) => row.id),
  );
  for (const summary of await repository.list({ includeDeleted: true })) {
    const record = await repository.getById(summary.id, { includeDeleted: true });
    for (const ref of collectLinkedReferences(record.facts, sampleContext)) {
      expect(active.has(ref.characterId), `${summary.displayName} → ${ref.at}`).toBe(true);
    }
  }
}

describe("create and read", () => {
  it("round-trips a minimal character", async () => {
    const created = await repository.create(sampleMinimal);
    expect(created.revision).toBe(1);
    const read = await repository.getById(created.id);
    expect(read.facts).toEqual(sampleMinimal);
    expect(read.pendingMigration).toBeUndefined();
  });

  it("round-trips a full v3 sheet with library fields, references and sensitivity metadata", async () => {
    const { ngoc } = await seedPair();
    const read = await repository.getById(ngoc.id);
    expect(read.facts).toEqual(sampleContemporary);
    expect(read.facts.schemaVersion).toBe(CHARACTER_FACTS_SCHEMA_VERSION);
  });

  it("round-trips character-scoped definitions", async () => {
    await seedSampleLibrary(libraryRepository); // the fantasy sample marks lib.zodiac not_applicable
    const created = await repository.create(sampleFantasy);
    expect((await repository.getById(created.id)).facts).toEqual(sampleFantasy);
  });

  it("rejects invalid facts and stores nothing", async () => {
    const invalid = {
      ...sampleMinimal,
      values: { "identity.age": { state: "specified", value: { value: "27", unit: "years" } } },
    } as unknown as CharacterFacts;
    const error = await expectError(repository.create(invalid), "validation_failed");
    expect(JSON.stringify(error.details)).toContain("values.identity.age.value.value");
    expect(await repository.list()).toEqual([]);
  });

  it("rejects library fields whose definition is missing", async () => {
    await expectError(repository.create(sampleContemporary), "validation_failed");
  });

  it("allows duplicate display names", async () => {
    await repository.create(sampleMinimal);
    await repository.create(sampleMinimal);
    expect((await repository.list()).map((row) => row.displayName)).toEqual(["Khải", "Khải"]);
  });

  it("stores Unicode exactly as given", async () => {
    const decomposed = "Đặng Thị Ánh Nguyệt 🌙 月影".normalize("NFD");
    const created = await repository.create({ ...sampleMinimal, displayName: decomposed });
    expect((await repository.getById(created.id)).facts.displayName).toBe(decomposed);
  });
});

describe("display name and schema version have one source of truth", () => {
  it("keeps them in columns, not in the JSONB body", async () => {
    const created = await repository.create(sampleMinimal);
    const [row] = await db.select().from(characters).where(eq(characters.id, created.id));
    expect(row!.displayName).toBe("Khải");
    expect(row!.schemaVersion).toBe(CHARACTER_FACTS_SCHEMA_VERSION);
    expect(row!.facts).not.toHaveProperty("displayName");
    expect(row!.facts).not.toHaveProperty("schemaVersion");
  });

  it("updates the column when the display name changes", async () => {
    const created = await repository.create(sampleMinimal);
    const updated = await repository.update(
      created.id,
      { ...sampleMinimal, displayName: "Khải Nguyên" },
      1,
    );
    expect(updated.facts.displayName).toBe("Khải Nguyên");
    const [summary] = await repository.list();
    expect(summary!.displayName).toBe("Khải Nguyên");
  });

  it("refuses a second copy in JSONB at the database level", async () => {
    const insert = db.execute(sql`
      insert into characters (display_name, facts, schema_version)
      values ('A', ${JSON.stringify({ displayName: "B", values: {} })}::jsonb, 3)`);
    await expect(insert).rejects.toThrow();
  });
});

describe("optimistic locking", () => {
  it("increments the revision and rejects stale updates with the actual revision", async () => {
    const created = await repository.create(sampleMinimal);
    const next = { ...sampleMinimal, displayName: "Khải 2" };
    expect((await repository.update(created.id, next, 1)).revision).toBe(2);

    const error = await expectError(
      repository.update(created.id, sampleMinimal, 1),
      "revision_conflict",
    );
    expect(error.details).toEqual({ id: created.id, expectedRevision: 1, actualRevision: 2 });
    expect((await repository.getById(created.id)).facts.displayName).toBe("Khải 2");
  });

  it("lets exactly one of two concurrent updates with the same revision win", async () => {
    const created = await repository.create(sampleMinimal);
    const results = await Promise.allSettled([
      repository.update(created.id, { ...sampleMinimal, displayName: "A" }, 1),
      repository.update(created.id, { ...sampleMinimal, displayName: "B" }, 1),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find(
      (result) => result.status === "rejected",
    ) as PromiseRejectedResult;
    expect(isRepositoryError(rejected.reason, "revision_conflict")).toBe(true);
    expect((await repository.getById(created.id)).revision).toBe(2);
  });

  it("does not bump the revision for favourites", async () => {
    const created = await repository.create(sampleMinimal);
    await repository.setFavorite(created.id, true);
    const [summary] = await repository.list();
    expect(summary).toMatchObject({ isFavorite: true, revision: 1 });
  });
});

describe("reference index", () => {
  it("indexes every linked reference of the stored facts", async () => {
    const { ngoc } = await seedPair();
    expect(await referenceRows()).toEqual([
      {
        sourceCharacterId: ngoc.id,
        factRef: "history.events[evt_len_da_lat]",
        targetCharacterId: SAMPLE_CHARACTER_IDS.minimal,
      },
      {
        sourceCharacterId: ngoc.id,
        factRef: "relationships.entries[rel_khai]",
        targetCharacterId: SAMPLE_CHARACTER_IDS.minimal,
      },
    ]);
  });

  it("is rebuilt on update", async () => {
    const { ngoc } = await seedPair();
    const values = { ...sampleContemporary.values };
    delete values["history.events"];
    await repository.update(ngoc.id, { ...sampleContemporary, values }, 1);
    expect((await referenceRows()).map((row) => row.factRef)).toEqual([
      "relationships.entries[rel_khai]",
    ]);
  });

  it("rejects links to missing characters and rolls the whole create back", async () => {
    await seedSampleLibrary(libraryRepository);
    const error = await expectError(
      repository.create(sampleContemporary),
      "reference_target_missing",
    );
    expect(error.details).toEqual({ characterIds: [SAMPLE_CHARACTER_IDS.minimal] });
    expect(await repository.list({ includeDeleted: true })).toEqual([]);
    expect(await referenceRows()).toEqual([]);
  });

  it("rejects links to soft-deleted characters", async () => {
    await seedSampleLibrary(libraryRepository);
    const khai = await repository.create(sampleMinimal, { id: SAMPLE_CHARACTER_IDS.minimal });
    await repository.softDelete(khai.id, 1);
    await expectError(repository.create(sampleContemporary), "reference_target_missing");
  });
});

describe("soft delete", () => {
  it("hides the character but keeps the row", async () => {
    const created = await repository.create(sampleMinimal);
    const result = await repository.softDelete(created.id, 1);
    expect(result).toEqual({ revision: 2, detached: [] });
    await expectError(repository.getById(created.id), "not_found");
    expect(
      (await repository.getById(created.id, { includeDeleted: true })).deletedAt,
    ).toBeInstanceOf(Date);
    expect(await repository.list()).toEqual([]);
    await expectError(repository.update(created.id, sampleMinimal, 2), "not_found");
  });

  it("requires the current revision", async () => {
    const created = await repository.create(sampleMinimal);
    await repository.update(created.id, sampleMinimal, 1);
    await expectError(repository.softDelete(created.id, 1), "revision_conflict");
  });

  it("detaches every reference to the deleted character in one transaction", async () => {
    const { khai, ngoc } = await seedPair();
    const at = new Date("2026-10-11T09:00:00Z");
    const result = await repository.softDelete(khai.id, 1, at);
    expect(result.detached).toEqual([
      {
        characterId: ngoc.id,
        refs: ["history.events[evt_len_da_lat]", "relationships.entries[rel_khai]"],
      },
    ]);

    const after = await repository.getById(ngoc.id);
    expect(after.revision).toBe(2);
    const relationships = after.facts.values["relationships.entries"];
    if (relationships?.state !== "specified") throw new Error("lost relationships");
    expect((relationships.value as Record<string, unknown>[])[0]).toEqual({
      id: "rel_khai",
      person: {
        type: "unlinked",
        name: "Khải",
        detachedFrom: {
          characterId: khai.id,
          reason: "character_deleted",
          at: at.toISOString(),
        },
      },
      type: { option: "friend" },
      description: "Bạn thân từ thời đại học.",
    });
    // Privacy metadata and the other items survive the rewrite.
    expect(relationships.sensitiveItemIds).toEqual(["rel_me"]);
    expect(await referenceRows()).toEqual([]);
    await expectNoDanglingReferences();
  });

  it("rolls everything back when one referencing character cannot be rewritten", async () => {
    const { khai, ngoc } = await seedPair();
    // Corrupt a referencing row behind the repository's back.
    await db.execute(sql`
      update characters
      set facts = jsonb_set(facts, '{values,identity.favorite_color}', '{"state":"specified","value":"đỏ"}')
      where id = ${ngoc.id}`);

    await expectError(repository.softDelete(khai.id, 1), "validation_failed");
    expect((await repository.getById(khai.id)).deletedAt).toBeNull();
    const [row] = await db.select().from(characters).where(eq(characters.id, ngoc.id));
    expect(row!.revision).toBe(1);
    expect((await referenceRows()).length).toBe(2);
  });

  it("never leaves dangling references when delete and update race", async () => {
    await seedSampleLibrary(libraryRepository);
    const target = await repository.create(sampleMinimal, { id: SAMPLE_CHARACTER_IDS.minimal });
    const referencing = await repository.create({ ...sampleMinimal, displayName: "Người viết" });
    const linkFacts: CharacterFacts = {
      ...sampleMinimal,
      displayName: "Người viết",
      values: {
        "relationships.entries": {
          state: "specified",
          value: [{ id: "r1", person: { type: "character", characterId: target.id } }],
        },
      },
    };

    const results = await Promise.allSettled([
      repository.update(referencing.id, linkFacts, 1),
      repository.softDelete(target.id, 1),
    ]);
    expect(results[1].status).toBe("fulfilled");
    if (results[0].status === "rejected") {
      expect(isRepositoryError(results[0].reason, "reference_target_missing")).toBe(true);
    }
    await expectNoDanglingReferences();
  });
});

describe("library definitions in use", () => {
  beforeEach(() => seedSampleLibrary(libraryRepository));

  it("keeps characters valid and editable after their library field is deprecated", async () => {
    await repository.create(sampleMinimal, { id: SAMPLE_CHARACTER_IDS.minimal });
    const ngoc = await repository.create(sampleContemporary);
    await libraryRepository.deprecateField("lib.secret");
    expect((await repository.getById(ngoc.id)).facts).toEqual(sampleContemporary);
    expect((await repository.update(ngoc.id, sampleContemporary, 1)).revision).toBe(2);
  });

  it("refuses new uses of a deprecated library field", async () => {
    await libraryRepository.deprecateField("lib.zodiac");
    const facts: CharacterFacts = {
      ...sampleMinimal,
      values: {
        ...sampleMinimal.values,
        "lib.zodiac": { state: "specified", value: { option: "ox" } },
      },
    };
    const error = await expectError(repository.create(facts), "definition_deprecated");
    expect(error.details).toEqual({ keys: ["lib.zodiac"] });
  });
});

describe("reading data stored with an older schema", () => {
  it("migrates v1 rows in memory, reports review items, and does not write", async () => {
    const { displayName, schemaVersion, ...body } = v1Contemporary;
    // v1 sample references Khải; insert raw (the index is irrelevant for this test).
    const [row] = await db
      .insert(characters)
      .values({ displayName, schemaVersion, facts: body as Record<string, unknown> })
      .returning();

    const read = await repository.getById(row!.id);
    expect(read.facts.schemaVersion).toBe(CHARACTER_FACTS_SCHEMA_VERSION);
    expect(read.facts.values["identity.gender"]).toEqual({
      state: "specified",
      value: { option: "female" },
    });
    expect(read.pendingMigration?.fromVersion).toBe(1);
    expect(read.pendingMigration?.review).toContainEqual({
      key: "identity.gender",
      reason: "ambiguous_gender",
    });

    const [stored] = await db.select().from(characters).where(eq(characters.id, row!.id));
    expect(stored!.schemaVersion).toBe(1);
    expect(stored!.revision).toBe(1);
  });

  it("stores the current version on the next update", async () => {
    await repository.create(sampleMinimal, { id: SAMPLE_CHARACTER_IDS.minimal });
    const { displayName, schemaVersion, ...body } = v1Contemporary;
    const [row] = await db
      .insert(characters)
      .values({ displayName, schemaVersion, facts: body as Record<string, unknown> })
      .returning();
    const read = await repository.getById(row!.id);
    const saved = await repository.update(row!.id, read.facts, read.revision);
    expect(saved.pendingMigration).toBeUndefined();
    const [stored] = await db.select().from(characters).where(eq(characters.id, row!.id));
    expect(stored!.schemaVersion).toBe(CHARACTER_FACTS_SCHEMA_VERSION);
  });

  it("reports unsupported versions without touching the row", async () => {
    const [row] = await db
      .insert(characters)
      .values({ displayName: "Tương lai", schemaVersion: 99, facts: { values: {} } })
      .returning();
    const error = await expectError(repository.getById(row!.id), "unsupported_schema");
    expect(error.details).toMatchObject({ schemaVersion: 99, reason: "unsupported_version" });
  });
});
