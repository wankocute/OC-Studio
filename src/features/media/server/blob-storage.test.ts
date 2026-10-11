// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PNG_1X1 } from "../test-images";

const blob = vi.hoisted(() => ({
  put: vi.fn(),
  get: vi.fn(),
  del: vi.fn(),
}));
vi.mock("@vercel/blob", () => blob);

import {
  BlobStorage,
  createStorageKey,
  getMediaStorage,
  InvalidStorageKeyError,
  LocalFileStorage,
  MediaStorageUnavailableError,
  readStoredBytes,
} from "./storage";

const TOKEN = "vercel_blob_rw_test";

beforeEach(() => {
  blob.put.mockReset().mockResolvedValue({});
  blob.get.mockReset();
  blob.del.mockReset().mockResolvedValue(undefined);
});
afterEach(() => vi.unstubAllEnvs());

describe("BlobStorage", () => {
  it("writes private blobs at the storage key, never overwriting and without a random suffix", async () => {
    const key = createStorageKey("png");
    await new BlobStorage(TOKEN).put(key, PNG_1X1, "image/png");
    expect(blob.put).toHaveBeenCalledExactlyOnceWith(
      key,
      expect.anything(),
      expect.objectContaining({
        access: "private",
        contentType: "image/png",
        addRandomSuffix: false,
        allowOverwrite: false,
        token: TOKEN,
      }),
    );
  });

  it("streams private blobs and reports missing ones as null", async () => {
    const key = createStorageKey("png");
    blob.get.mockResolvedValueOnce({
      statusCode: 200,
      stream: new Response(PNG_1X1).body,
      blob: { size: PNG_1X1.byteLength },
    });
    const storage = new BlobStorage(TOKEN);
    expect(await readStoredBytes(storage, key, 1_000)).toEqual(PNG_1X1);
    expect(blob.get).toHaveBeenCalledWith(key, { access: "private", token: TOKEN });

    blob.get.mockResolvedValueOnce(null);
    expect(await storage.get(key)).toBeNull();
  });

  it("refuses an oversized blob from its size, without reading it", async () => {
    const cancel = vi.fn();
    blob.get.mockResolvedValueOnce({
      statusCode: 200,
      stream: { cancel, getReader: vi.fn() },
      blob: { size: 9_000_000 },
    });
    expect(await readStoredBytes(new BlobStorage(TOKEN), createStorageKey("png"), 1_000)).toBe(
      "too_large",
    );
    expect(cancel).toHaveBeenCalled();
  });

  it("deletes by key and rejects anything that is not a storage key", async () => {
    const key = createStorageKey("webp");
    await new BlobStorage(TOKEN).delete(key);
    expect(blob.del).toHaveBeenCalledWith(key, { token: TOKEN });
    await expect(new BlobStorage(TOKEN).delete("media/../secret")).rejects.toThrow(
      InvalidStorageKeyError,
    );
    expect(blob.del).toHaveBeenCalledTimes(1);
  });
});

describe("getMediaStorage", () => {
  it("uses Blob when the token is set", () => {
    vi.stubEnv("BLOB_READ_WRITE_TOKEN", TOKEN);
    expect(getMediaStorage()).toBeInstanceOf(BlobStorage);
  });

  it("uses the disk locally without a token", () => {
    vi.stubEnv("BLOB_READ_WRITE_TOKEN", "");
    vi.stubEnv("VERCEL", "");
    expect(getMediaStorage()).toBeInstanceOf(LocalFileStorage);
  });

  it("refuses the (read-only, ephemeral) disk on Vercel", () => {
    vi.stubEnv("BLOB_READ_WRITE_TOKEN", "");
    vi.stubEnv("VERCEL", "1");
    expect(() => getMediaStorage()).toThrow(MediaStorageUnavailableError);
  });
});
