import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { mediaAssets } from "@/db/schema";
import { sampleMinimal } from "@/features/characters/__tests__/fixtures/sample-characters";
import { createCharacterRepository } from "@/features/characters/server/character-repository";
import { createMediaRepository } from "@/features/library/server/media-repository";
import { connectTestDatabase } from "@/test/integration-context";

import { GIF_1X1, PNG_1X1 } from "../test-images";

import { MediaUploadError, removeCharacterImage, uploadCharacterImage } from "./media-service";
import { LocalFileStorage } from "./storage";

const { db } = connectTestDatabase();
const media = createMediaRepository(db);

let root: string;
let storage: LocalFileStorage;
let characterId: string;

async function storedFiles(): Promise<string[]> {
  const entries = await readdir(root, { recursive: true, withFileTypes: true });
  return entries.filter((entry) => entry.isFile()).map((entry) => entry.name);
}

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "oc-studio-media-"));
  storage = new LocalFileStorage(root);
  characterId = (await createCharacterRepository(db).create(sampleMinimal)).id;
});

afterAll(async () => {
  if (root) await rm(root, { recursive: true, force: true });
});

const deps = () => ({ db, storage });

describe("uploadCharacterImage", () => {
  it("stores the file and records metadata from the file signature", async () => {
    const asset = await uploadCharacterImage(deps(), {
      characterId,
      role: "reference",
      bytes: PNG_1X1,
      filename: "../../ảnh tham khảo.png",
    });
    expect(asset).toMatchObject({
      mimeType: "image/png",
      byteSize: PNG_1X1.byteLength,
      width: 1,
      height: 1,
    });
    expect(asset.storageKey).toMatch(/^media\/\d{4}\/\d{2}\/[0-9a-f-]{36}\.png$/);
    expect(asset.originalFilename).toBe("....ảnh tham khảo.png"); // slashes stripped, kept for display only
    expect(new Uint8Array((await storage.get(asset.storageKey))!)).toEqual(PNG_1X1);
    expect(await media.listForCharacter(characterId)).toHaveLength(1);
  });

  it("rejects non-images, empty and oversized files without storing anything", async () => {
    const fake = new TextEncoder().encode("<svg onload=alert(1)>");
    await expect(
      uploadCharacterImage(deps(), { characterId, role: "avatar", bytes: fake, filename: "x.png" }),
    ).rejects.toMatchObject({ code: "unsupported" });
    await expect(
      uploadCharacterImage(deps(), { characterId, role: "avatar", bytes: new Uint8Array() }),
    ).rejects.toBeInstanceOf(MediaUploadError);
    const huge = new Uint8Array(8 * 1024 * 1024 + 1);
    huge.set(PNG_1X1);
    await expect(
      uploadCharacterImage(deps(), { characterId, role: "avatar", bytes: huge }),
    ).rejects.toMatchObject({ code: "too_large" });
    expect(await storedFiles()).toEqual([]);
    expect(await db.select().from(mediaAssets)).toEqual([]);
  });

  it("removes the stored file when the database step fails", async () => {
    await createCharacterRepository(db).softDelete(characterId, 1);
    await expect(
      uploadCharacterImage(deps(), { characterId, role: "avatar", bytes: PNG_1X1 }),
    ).rejects.toMatchObject({ code: "not_found" });
    expect(await storedFiles()).toEqual([]);
    expect(await db.select().from(mediaAssets)).toEqual([]);
  });

  it("replaces the avatar and deletes the old file when nothing else uses it", async () => {
    const first = await uploadCharacterImage(deps(), {
      characterId,
      role: "avatar",
      bytes: PNG_1X1,
    });
    const second = await uploadCharacterImage(deps(), {
      characterId,
      role: "avatar",
      bytes: GIF_1X1,
    });
    const links = await media.listForCharacter(characterId);
    expect(links.map((link) => [link.role, link.mediaId])).toEqual([["avatar", second.id]]);
    expect(await storage.get(first.storageKey)).toBeNull();
    expect((await db.select().from(mediaAssets)).map((row) => row.id)).toEqual([second.id]);
  });

  it("appends reference images in order", async () => {
    const a = await uploadCharacterImage(deps(), {
      characterId,
      role: "reference",
      bytes: PNG_1X1,
    });
    const b = await uploadCharacterImage(deps(), {
      characterId,
      role: "reference",
      bytes: GIF_1X1,
    });
    const links = await media.listForCharacter(characterId);
    expect(links.map((link) => [link.mediaId, link.position])).toEqual([
      [a.id, 0],
      [b.id, 1],
    ]);
  });
});

describe("removeCharacterImage", () => {
  it("detaches the image and deletes its file and row when unused", async () => {
    const asset = await uploadCharacterImage(deps(), {
      characterId,
      role: "reference",
      bytes: PNG_1X1,
    });
    await removeCharacterImage(deps(), characterId, asset.id);
    expect(await media.listForCharacter(characterId)).toEqual([]);
    expect(await storage.get(asset.storageKey)).toBeNull();
    expect(await db.select().from(mediaAssets)).toEqual([]);
  });

  it("keeps the file while another character still uses it", async () => {
    const other = (
      await createCharacterRepository(db).create({ ...sampleMinimal, displayName: "B" })
    ).id;
    const asset = await uploadCharacterImage(deps(), {
      characterId,
      role: "reference",
      bytes: PNG_1X1,
    });
    await media.attach({ characterId: other, mediaId: asset.id, role: "reference" });
    await removeCharacterImage(deps(), characterId, asset.id);
    expect(await storage.get(asset.storageKey)).not.toBeNull();
    expect(await media.listForCharacter(other)).toHaveLength(1);
  });
});
