import "server-only";

import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { getServerEnv } from "@/lib/env";

/**
 * Minimal file storage abstraction. The database keeps only `storage_key`s; swapping this
 * implementation for object storage later needs no row or character-fact changes.
 */
export interface MediaStorage {
  put(key: string, bytes: Uint8Array): Promise<void>;
  /** `null` when the object does not exist. */
  get(key: string): Promise<Buffer | null>;
  /** Idempotent. */
  delete(key: string): Promise<void>;
}

/** Keys look like `media/2026/10/<uuid>.png` — lowercase, no `..`, no absolute paths. */
const STORAGE_KEY_PATTERN = /^media\/\d{4}\/\d{2}\/[0-9a-f-]{36}\.(png|jpg|gif|webp)$/;

export function isValidStorageKey(key: string): boolean {
  return STORAGE_KEY_PATTERN.test(key);
}

export class InvalidStorageKeyError extends Error {
  constructor() {
    super("Invalid storage key.");
    this.name = "InvalidStorageKeyError";
  }
}

export function createStorageKey(extension: string, now = new Date()): string {
  const year = String(now.getUTCFullYear());
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `media/${year}/${month}/${randomUUID()}.${extension}`;
}

/** Local disk storage rooted at one directory; every path is resolved and checked against it. */
export class LocalFileStorage implements MediaStorage {
  private readonly root: string;

  constructor(root: string) {
    this.root = path.resolve(root);
  }

  /** Map a key to a path inside the root, or throw — never a path outside it. */
  resolve(key: string): string {
    if (!isValidStorageKey(key)) throw new InvalidStorageKeyError();
    const resolved = path.resolve(this.root, ...key.split("/"));
    if (!resolved.startsWith(this.root + path.sep)) throw new InvalidStorageKeyError();
    return resolved;
  }

  async put(key: string, bytes: Uint8Array): Promise<void> {
    const target = this.resolve(key);
    await mkdir(path.dirname(target), { recursive: true });
    // Write to a temporary file first so a crash never leaves a half-written image under the key.
    const temporary = `${target}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporary, bytes, { flag: "wx" });
      await rename(temporary, target);
    } catch (error) {
      await rm(temporary, { force: true });
      throw error;
    }
  }

  async get(key: string): Promise<Buffer | null> {
    try {
      return await readFile(this.resolve(key));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  }

  async delete(key: string): Promise<void> {
    await rm(this.resolve(key), { force: true });
  }
}

let storage: MediaStorage | undefined;

/** App-wide storage: `MEDIA_STORAGE_DIR`, or `storage/` in the project (outside `public/`). */
export function getMediaStorage(): MediaStorage {
  storage ??= new LocalFileStorage(
    getServerEnv().MEDIA_STORAGE_DIR ?? path.join(process.cwd(), "storage"),
  );
  return storage;
}
