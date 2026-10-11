// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

import type * as MediaService from "./server/media-service";
import type * as Storage from "./server/storage";

const mocks = vi.hoisted(() => ({
  denied: null as unknown,
  kind: "blob" as "blob" | "disk",
  attach: vi.fn(),
}));
vi.mock("next/cache", () => ({ refresh: vi.fn() }));
vi.mock("@/db", () => ({ getDb: () => ({}) }));
vi.mock("@/features/auth/server/session", () => ({
  rejectUnauthenticatedAction: async () => mocks.denied,
}));
vi.mock("./server/storage", async (importOriginal) => ({
  ...(await importOriginal<typeof Storage>()),
  getMediaStorage: () => ({ kind: mocks.kind }),
}));
vi.mock("./server/media-service", async (importOriginal) => ({
  ...(await importOriginal<typeof MediaService>()),
  attachUploadedImage: mocks.attach,
}));

import {
  attachUploadedImageAction,
  prepareImageUploadAction,
  setAvatarCropAction,
} from "./actions";
import { MediaUploadError } from "./server/media-service";

const CHARACTER = "0b0e7c2e-6c55-4c62-9a43-1b3f2c3d4e5f";

beforeEach(() => {
  mocks.denied = null;
  mocks.kind = "blob";
  mocks.attach.mockReset();
});

describe("prepareImageUploadAction", () => {
  it("sends the browser straight to Blob under a server-generated key", async () => {
    const result = await prepareImageUploadAction({ contentType: "image/jpeg", size: 6_000_000 });
    expect(result).toMatchObject({ ok: true, data: { mode: "direct" } });
    if (result.ok && result.data.mode === "direct") {
      expect(result.data.storageKey).toMatch(/^media\/\d{4}\/\d{2}\/[0-9a-f-]{36}\.jpg$/);
    }
  });

  it("uses the server upload when images live on disk", async () => {
    mocks.kind = "disk";
    expect(await prepareImageUploadAction({ contentType: "image/png", size: 10 })).toEqual({
      ok: true,
      data: { mode: "form" },
    });
  });

  it("refuses other types and files over 8 MB before anything is uploaded", async () => {
    expect(
      await prepareImageUploadAction({ contentType: "image/svg+xml", size: 10 }),
    ).toMatchObject({ ok: false, error: { code: "upload_failed" } });
    expect(
      await prepareImageUploadAction({ contentType: "image/png", size: 8 * 1024 * 1024 + 1 }),
    ).toMatchObject({ ok: false, error: { code: "upload_failed" } });
  });

  it("requires a session", async () => {
    mocks.denied = { ok: false, error: { code: "unauthenticated", message: "x" } };
    expect(await prepareImageUploadAction({ contentType: "image/png", size: 10 })).toBe(
      mocks.denied,
    );
  });
});

describe("attachUploadedImageAction", () => {
  it("validates input and reports a rejected upload as a user-facing error", async () => {
    expect(await attachUploadedImageAction({ characterId: "nope" })).toMatchObject({
      ok: false,
      error: { code: "invalid_input" },
    });
    mocks.attach.mockRejectedValueOnce(new MediaUploadError("unsupported"));
    expect(
      await attachUploadedImageAction({
        characterId: CHARACTER,
        role: "avatar",
        storageKey: "media/2026/10/0b0e7c2e-6c55-4c62-9a43-1b3f2c3d4e5f.png",
      }),
    ).toMatchObject({ ok: false, error: { code: "upload_failed" } });
  });
});

describe("avatar crop", () => {
  const KEY = "media/2026/10/0b0e7c2e-6c55-4c62-9a43-1b3f2c3d4e5f.png";
  const CROP = { x: 0.1, y: 0, width: 0.5, height: 1 };

  it("attaches the crop chosen before upload together with the avatar", async () => {
    mocks.attach.mockResolvedValueOnce({});
    expect(
      await attachUploadedImageAction({
        characterId: CHARACTER,
        role: "avatar",
        storageKey: KEY,
        crop: CROP,
      }),
    ).toEqual({ ok: true, data: undefined });
    expect(mocks.attach).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ role: "avatar", crop: CROP }),
    );
  });

  it("refuses a crop on a reference image or outside the image, before storing anything", async () => {
    for (const input of [
      { role: "reference", crop: CROP },
      { role: "avatar", crop: { x: 0.8, y: 0, width: 0.5, height: 1 } },
    ]) {
      expect(
        await attachUploadedImageAction({ characterId: CHARACTER, storageKey: KEY, ...input }),
      ).toMatchObject({ ok: false, error: { code: "invalid_input" } });
    }
    expect(mocks.attach).not.toHaveBeenCalled();
  });

  it("validates a re-crop before touching the database", async () => {
    expect(
      await setAvatarCropAction({ characterId: CHARACTER, mediaId: "nope", crop: CROP }),
    ).toMatchObject({ ok: false, error: { code: "invalid_input" } });
    mocks.denied = { ok: false, error: { code: "unauthenticated", message: "x" } };
    expect(
      await setAvatarCropAction({ characterId: CHARACTER, mediaId: CHARACTER, crop: CROP }),
    ).toBe(mocks.denied);
  });
});
