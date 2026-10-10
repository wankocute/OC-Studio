import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { applyBasicInfo, basicInfoSchema, toBasicInfoForm } from "@/features/characters/basic-info";
import type { CharacterFacts } from "@/features/characters/domain";
import { sampleMinimal } from "@/features/characters/__tests__/fixtures/sample-characters";
import { createCollectionRepository } from "@/features/library/server/collection-repository";
import { createTagRepository } from "@/features/library/server/tag-repository";
import { connectTestDatabase } from "@/test/integration-context";

import { createCharacterRepository } from "./character-repository";
import { getLibraryStats, listLibraryCharacters } from "./library-queries";

const { db } = connectTestDatabase();
const characters = createCharacterRepository(db);

async function create(displayName: string, occupation?: string) {
  const values: CharacterFacts["values"] = occupation
    ? { "lifestyle.occupation": { state: "specified", value: occupation } }
    : {};
  return characters.create({ ...sampleMinimal, displayName, values });
}

/** Spread timestamps so sorting by date is deterministic. */
async function setTimes(id: string, createdMinutesAgo: number, updatedMinutesAgo: number) {
  await db.execute(sql`
    update characters
    set created_at = now() - make_interval(mins => ${createdMinutesAgo}),
        updated_at = now() - make_interval(mins => ${updatedMinutesAgo})
    where id = ${id}`);
}

const names = async (filter: Parameters<typeof listLibraryCharacters>[1]) =>
  (await listLibraryCharacters(db, filter)).map((card) => card.displayName);

describe("library search and sort", () => {
  it("searches by name, case-insensitively, including Vietnamese", async () => {
    await create("Trần Bảo Ngọc");
    await create("Ngô Khải");
    await create("Dạ Vân");
    expect(await names({ q: "ngọc" })).toEqual(["Trần Bảo Ngọc"]);
    expect(await names({ q: "NG", sort: "name" })).toEqual(["Ngô Khải", "Trần Bảo Ngọc"]);
    expect(await names({ q: "zzz" })).toEqual([]);
  });

  it("treats LIKE wildcards in the query literally", async () => {
    await create("100% Ngọc");
    await create("Ngọc_mini");
    await create("Ngọc thường");
    expect(await names({ q: "%" })).toEqual(["100% Ngọc"]);
    expect(await names({ q: "_" })).toEqual(["Ngọc_mini"]);
  });

  it("sorts by name, creation and last update", async () => {
    const a = await create("An");
    const b = await create("Bình");
    const c = await create("Chi");
    await setTimes(a.id, 10, 1);
    await setTimes(b.id, 30, 20);
    await setTimes(c.id, 20, 5);
    expect(await names({ sort: "name" })).toEqual(["An", "Bình", "Chi"]);
    expect(await names({ sort: "created" })).toEqual(["An", "Chi", "Bình"]);
    expect(await names({ sort: "updated" })).toEqual(["An", "Chi", "Bình"]);
  });

  it("allows duplicate names", async () => {
    await create("Khải");
    await create("Khải");
    expect(await names({ q: "khải" })).toEqual(["Khải", "Khải"]);
  });

  it("filters favourites, tags and collections, and hides deleted characters", async () => {
    const a = await create("An", "Họa sĩ");
    const b = await create("Bình");
    const deleted = await create("Cũ");
    await characters.setFavorite(a.id, true);
    const tag = await createTagRepository(db).create("Fantasy");
    await createTagRepository(db).attach(b.id, tag.id);
    const collection = await createCollectionRepository(db).create({ name: "Thế giới" });
    await createCollectionRepository(db).addCharacter(collection.id, a.id);
    await characters.softDelete(deleted.id, 1);

    expect(await names({ sort: "name" })).toEqual(["An", "Bình"]);
    expect(await names({ favorites: true })).toEqual(["An"]);
    expect(await names({ tagId: tag.id })).toEqual(["Bình"]);
    expect(await names({ collectionId: collection.id })).toEqual(["An"]);

    const [card] = await listLibraryCharacters(db, { favorites: true });
    expect(card).toMatchObject({
      isFavorite: true,
      summary: ["Họa sĩ"],
      avatarMediaId: null,
      tags: [],
    });
    expect(await getLibraryStats(db)).toEqual({ characters: 2, favorites: 1, collections: 1 });
  });
});

describe("editing basic info through the repository", () => {
  it("keeps other facts and rejects a stale revision", async () => {
    const created = await characters.create(sampleMinimal);
    const form = toBasicInfoForm(created.facts);
    const edited = applyBasicInfo(
      created.facts,
      basicInfoSchema.parse({ ...form.values, displayName: "Khải Nguyên", species: "Người" }),
    );
    const saved = await characters.update(created.id, edited, 1);
    expect(saved.facts.values["personality.core_traits"]).toEqual(
      sampleMinimal.values["personality.core_traits"],
    );
    expect(saved.facts.values["identity.species"]).toEqual({ state: "specified", value: "Người" });
    await expect(characters.update(created.id, edited, 1)).rejects.toMatchObject({
      code: "revision_conflict",
    });
  });
});
