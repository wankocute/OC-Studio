import { sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { isRepositoryError, type RepositoryErrorCode } from "@/db/repository-errors";
import { sampleMinimal } from "@/features/characters/__tests__/fixtures/sample-characters";
import { createCharacterRepository } from "@/features/characters/server/character-repository";
import { connectTestDatabase } from "@/test/integration-context";

import { createCollectionRepository } from "./collection-repository";
import { createMediaRepository } from "./media-repository";
import { createTagRepository } from "./tag-repository";

const { db } = connectTestDatabase();
const characterRepository = createCharacterRepository(db);
const tagRepository = createTagRepository(db);
const collectionRepository = createCollectionRepository(db);
const mediaRepository = createMediaRepository(db);

async function expectError(promise: Promise<unknown>, code: RepositoryErrorCode) {
  const error = await promise.then(
    () => undefined,
    (caught: unknown) => caught,
  );
  expect(isRepositoryError(error, code), `expected ${code}, got ${String(error)}`).toBe(true);
  return error as { details: Record<string, unknown> };
}

let characterId: string;
beforeEach(async () => {
  characterId = (await characterRepository.create(sampleMinimal)).id;
});

describe("tags", () => {
  it("are unique ignoring case and surrounding whitespace", async () => {
    const tag = await tagRepository.create("  Fantasy ");
    expect(tag.name).toBe("Fantasy");
    const error = await expectError(tagRepository.create("fantasy"), "duplicate");
    expect(error.details).toEqual({ constraint: "tags_name_unique" });
    await expectError(tagRepository.create("   "), "validation_failed");
  });

  it("attach idempotently and only to active characters", async () => {
    const tag = await tagRepository.create("Kiếm khách");
    await tagRepository.attach(characterId, tag.id);
    await tagRepository.attach(characterId, tag.id);
    expect((await tagRepository.listForCharacter(characterId)).map((row) => row.name)).toEqual([
      "Kiếm khách",
    ]);

    await characterRepository.softDelete(characterId, 1);
    const other = await tagRepository.create("Khác");
    await expectError(tagRepository.attach(characterId, other.id), "not_found");
  });

  it("detach removes only the link", async () => {
    const tag = await tagRepository.create("Tạm");
    await tagRepository.attach(characterId, tag.id);
    await tagRepository.detach(characterId, tag.id);
    expect(await tagRepository.listForCharacter(characterId)).toEqual([]);
    expect((await tagRepository.list()).map((row) => row.name)).toEqual(["Tạm"]);
  });
});

describe("collections", () => {
  it("are flat, unique by name ignoring case, and hold many characters", async () => {
    const world = await collectionRepository.create({
      name: "Thế giới Sương Mù",
      description: " ",
    });
    expect(world.description).toBeNull();
    await expectError(collectionRepository.create({ name: "thế giới sương mù" }), "duplicate");

    const second = (await characterRepository.create({ ...sampleMinimal, displayName: "An" })).id;
    await collectionRepository.addCharacter(world.id, characterId, 1);
    await collectionRepository.addCharacter(world.id, second, 0);
    await collectionRepository.addCharacter(world.id, second, 5); // idempotent
    expect(
      (await collectionRepository.listCharacters(world.id)).map((row) => row.displayName),
    ).toEqual(["An", "Khải"]);
  });

  it("let one character belong to several collections", async () => {
    const a = await collectionRepository.create({ name: "A" });
    const b = await collectionRepository.create({ name: "B" });
    await collectionRepository.addCharacter(a.id, characterId);
    await collectionRepository.addCharacter(b.id, characterId);
    expect(await collectionRepository.listCharacters(a.id)).toHaveLength(1);
    expect(await collectionRepository.listCharacters(b.id)).toHaveLength(1);
    await collectionRepository.removeCharacter(a.id, characterId);
    expect(await collectionRepository.listCharacters(a.id)).toEqual([]);
  });
});

describe("media metadata", () => {
  const asset = (storageKey: string) => ({
    storageKey,
    originalFilename: "ảnh đại diện.png",
    mimeType: "image/png",
    byteSize: 20_480,
    width: 512,
    height: 512,
  });

  it("validates metadata and keeps storage keys unique", async () => {
    await expectError(
      mediaRepository.createAsset({ ...asset("a.png"), mimeType: "application/pdf" }),
      "validation_failed",
    );
    await expectError(
      mediaRepository.createAsset({ ...asset("b.png"), height: undefined }),
      "validation_failed",
    );
    await expectError(
      mediaRepository.createAsset({ ...asset("c.png"), byteSize: 0 }),
      "validation_failed",
    );
    await mediaRepository.createAsset(asset("media/x.png"));
    await expectError(mediaRepository.createAsset(asset("media/x.png")), "duplicate");
  });

  it("allows one avatar and one primary image per character, with ordered references", async () => {
    const avatar = await mediaRepository.createAsset(asset("media/avatar.png"));
    const ref1 = await mediaRepository.createAsset(asset("media/ref1.png"));
    const ref2 = await mediaRepository.createAsset(asset("media/ref2.png"));
    await mediaRepository.attach({ characterId, mediaId: avatar.id, role: "avatar" });
    await mediaRepository.attach({ characterId, mediaId: ref2.id, role: "reference", position: 1 });
    await mediaRepository.attach({ characterId, mediaId: ref1.id, role: "reference", position: 0 });
    await expectError(
      mediaRepository.attach({ characterId, mediaId: ref1.id, role: "avatar" }),
      "duplicate",
    );
    const another = await mediaRepository.createAsset(asset("media/avatar2.png"));
    await expectError(
      mediaRepository.attach({ characterId, mediaId: another.id, role: "avatar" }),
      "duplicate",
    );

    await mediaRepository.setPrimary(characterId, avatar.id);
    await mediaRepository.setPrimary(characterId, ref1.id);
    const listed = await mediaRepository.listForCharacter(characterId);
    expect(listed.map((row) => [row.role, row.storageKey, row.isPrimary])).toEqual([
      ["avatar", "media/avatar.png", false],
      ["reference", "media/ref1.png", true],
      ["reference", "media/ref2.png", false],
    ]);
    await expectError(mediaRepository.setPrimary(characterId, another.id), "not_found");
  });

  it("does not let an asset in use be deleted from under a character", async () => {
    const image = await mediaRepository.createAsset(asset("media/used.png"));
    await mediaRepository.attach({ characterId, mediaId: image.id, role: "reference" });
    await expect(
      db.execute(sql`delete from media_assets where id = ${image.id}`),
    ).rejects.toThrow();
  });
});
