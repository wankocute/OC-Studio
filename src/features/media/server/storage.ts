import "server-only";

import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { del, get, put } from "@vercel/blob";

import { getServerEnv } from "@/lib/env";

/** A stored file being read. Streamed, so serving it never buffers a whole image. */
export type StoredMedia = { body: ReadableStream<Uint8Array>; size: number | null };

/**
 * Minimal file storage abstraction. The database keeps only `storage_key`s; both backends use the
 * key itself as the path, so moving files between them needs no row or character-fact changes.
 */
export interface MediaStorage {
  /** `blob`: the browser uploads directly (Vercel's 4.5 MB request limit); `disk`: via the server. */
  readonly kind: "disk" | "blob";
  put(key: string, bytes: Uint8Array, contentType: string): Promise<void>;
  /** `null` when the object does not exist. */
  get(key: string): Promise<StoredMedia | null>;
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

/** Errors that mean "the directory itself is unusable", not "this one file failed". */
const UNUSABLE_DIRECTORY_CODES = new Set([
  "EACCES",
  "EPERM",
  "EROFS",
  "ENOSPC",
  "ENOTDIR",
  "EDQUOT",
]);

/** Operator-facing: names what to check (logged by the media service). */
export class MediaStorageUnavailableError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "MediaStorageUnavailableError";
  }

  static directory(root: string, errorCode: string, options?: ErrorOptions) {
    return new MediaStorageUnavailableError(
      `Không ghi được vào thư mục ảnh "${root}" (${errorCode}). Kiểm tra MEDIA_STORAGE_DIR, ` +
        "quyền ghi và dung lượng đĩa.",
      options,
    );
  }
}

export function createStorageKey(extension: string, now = new Date()): string {
  const year = String(now.getUTCFullYear());
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `media/${year}/${month}/${randomUUID()}.${extension}`;
}

/**
 * Read a stored file into memory, refusing anything over `maxBytes` (`too_large`) without
 * downloading the rest. Used to check an upload's real signature and size.
 */
export async function readStoredBytes(
  storage: MediaStorage,
  key: string,
  maxBytes: number,
): Promise<Uint8Array | "missing" | "too_large"> {
  const stored = await storage.get(key);
  if (!stored) return "missing";
  if (stored.size !== null && stored.size > maxBytes) {
    await stored.body.cancel();
    return "too_large";
  }
  const reader = stored.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      return "too_large";
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

function streamOf(bytes: Uint8Array): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
}

/** Local disk storage rooted at one directory; every path is resolved and checked against it. */
export class LocalFileStorage implements MediaStorage {
  readonly kind = "disk";
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
    try {
      // Creates the root too, so a fresh directory needs no manual setup.
      await mkdir(path.dirname(target), { recursive: true });
    } catch (error) {
      throw this.describe(error);
    }
    // Write to a temporary file first so a crash never leaves a half-written image under the key.
    const temporary = `${target}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporary, bytes, { flag: "wx" });
      await rename(temporary, target);
    } catch (error) {
      await rm(temporary, { force: true });
      throw this.describe(error);
    }
  }

  private describe(error: unknown): unknown {
    const code = (error as NodeJS.ErrnoException | undefined)?.code;
    return code && UNUSABLE_DIRECTORY_CODES.has(code)
      ? MediaStorageUnavailableError.directory(this.root, code, { cause: error })
      : error;
  }

  async get(key: string): Promise<StoredMedia | null> {
    try {
      const bytes = new Uint8Array(await readFile(this.resolve(key)));
      return { body: streamOf(bytes), size: bytes.byteLength };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  }

  async delete(key: string): Promise<void> {
    await rm(this.resolve(key), { force: true });
  }
}

/** Blobs are immutable here (a key is never reused), so the CDN may keep them a long time. */
const BLOB_CACHE_SECONDS = 365 * 24 * 60 * 60;

/**
 * Vercel Blob, private store: nothing is reachable without the token, so images are served only
 * through `/media/[id]` after the session check. The key is the blob pathname (no random suffix).
 */
export class BlobStorage implements MediaStorage {
  readonly kind = "blob";

  constructor(private readonly token?: string) {}

  private check(key: string) {
    if (!isValidStorageKey(key)) throw new InvalidStorageKeyError();
  }

  async put(key: string, bytes: Uint8Array, contentType: string): Promise<void> {
    this.check(key);
    await put(key, Buffer.from(bytes), {
      access: "private",
      contentType,
      addRandomSuffix: false,
      allowOverwrite: false,
      cacheControlMaxAge: BLOB_CACHE_SECONDS,
      token: this.token,
    });
  }

  async get(key: string): Promise<StoredMedia | null> {
    this.check(key);
    const result = await get(key, { access: "private", token: this.token });
    if (!result || result.statusCode !== 200 || !result.stream) return null;
    return { body: result.stream, size: result.blob.size };
  }

  async delete(key: string): Promise<void> {
    this.check(key);
    await del(key, { token: this.token });
  }
}

/**
 * App-wide storage: Vercel Blob when `BLOB_READ_WRITE_TOKEN` is set, otherwise the disk
 * (`MEDIA_STORAGE_DIR`, default `<project>/storage`, outside `public/`). On Vercel the disk is
 * read-only and wiped between invocations, so a missing token there is a configuration error.
 */
export function getMediaStorage(): MediaStorage {
  const env = getServerEnv();
  if (env.BLOB_READ_WRITE_TOKEN) return new BlobStorage(env.BLOB_READ_WRITE_TOKEN);
  if (process.env.VERCEL) {
    throw new MediaStorageUnavailableError(
      "Chưa kết nối Vercel Blob: thiếu BLOB_READ_WRITE_TOKEN. Tạo Blob store (Private) trong " +
        "tab Storage của project và kết nối nó, rồi deploy lại (xem docs/deploy-vercel.md).",
    );
  }
  return new LocalFileStorage(env.MEDIA_STORAGE_DIR ?? path.join(process.cwd(), "storage"));
}
