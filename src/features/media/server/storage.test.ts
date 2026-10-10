// @vitest-environment node
import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { PNG_1X1 } from "../test-images";

import {
  createStorageKey,
  InvalidStorageKeyError,
  isValidStorageKey,
  LocalFileStorage,
} from "./storage";

let root: string;
let storage: LocalFileStorage;

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "oc-studio-storage-"));
  storage = new LocalFileStorage(root);
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("storage keys", () => {
  it("are generated in the expected shape", () => {
    const key = createStorageKey("png", new Date("2026-10-11T00:00:00Z"));
    expect(key).toMatch(/^media\/2026\/10\/[0-9a-f-]{36}\.png$/);
    expect(isValidStorageKey(key)).toBe(true);
  });

  it.each([
    "../secret.png",
    "media/../../etc/passwd",
    "media/2026/10/../../../x.png",
    "/etc/passwd",
    "C:\\Windows\\win.ini",
    "media\\2026\\10\\00000000-0000-0000-0000-000000000000.png",
    "media/2026/10/00000000-0000-0000-0000-000000000000.svg",
    "media/2026/10/00000000-0000-0000-0000-000000000000.png\u0000.txt",
    "",
  ])("rejects %j", (key) => {
    expect(isValidStorageKey(key)).toBe(false);
    expect(() => storage.resolve(key)).toThrow(InvalidStorageKeyError);
  });
});

describe("LocalFileStorage", () => {
  it("writes, reads and deletes inside the root only", async () => {
    const key = createStorageKey("png");
    await storage.put(key, PNG_1X1);
    expect(storage.resolve(key).startsWith(path.resolve(root) + path.sep)).toBe(true);
    expect(new Uint8Array((await storage.get(key))!)).toEqual(PNG_1X1);
    await storage.delete(key);
    expect(await storage.get(key)).toBeNull();
    await storage.delete(key); // idempotent
  });

  it("never reads files outside the root", async () => {
    await writeFile(path.join(root, "..", "outside.png"), PNG_1X1).catch(() => undefined);
    await expect(storage.get("../outside.png")).rejects.toThrow(InvalidStorageKeyError);
    await expect(storage.put("../outside.png", PNG_1X1)).rejects.toThrow(InvalidStorageKeyError);
  });

  it("leaves no temporary files behind", async () => {
    const key = createStorageKey("gif");
    await storage.put(key, PNG_1X1);
    const directory = path.dirname(storage.resolve(key));
    expect((await readdir(directory)).filter((name) => name.endsWith(".tmp"))).toEqual([]);
  });

  it("returns null for missing files", async () => {
    expect(await storage.get(createStorageKey("png"))).toBeNull();
  });
});
