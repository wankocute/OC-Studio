// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

import { RepositoryError } from "@/db/repository-errors";
import { PNG_1X1 } from "@/features/media/test-images";

const mocks = vi.hoisted(() => ({
  denied: null as Response | null,
  getAsset: vi.fn(),
  get: vi.fn(),
}));
vi.mock("next/server", () => ({ connection: async () => {} }));
vi.mock("@/db", () => ({ getDb: () => ({}) }));
vi.mock("@/features/auth/server/session", () => ({
  rejectUnauthenticatedRequest: async () => mocks.denied,
}));
vi.mock("@/features/library/server/media-repository", () => ({
  createMediaRepository: () => ({ getAsset: mocks.getAsset }),
}));
vi.mock("@/features/media/server/storage", () => ({
  getMediaStorage: () => ({ get: mocks.get }),
}));

import { GET } from "./route";

const ID = "0b0e7c2e-6c55-4c62-9a43-1b3f2c3d4e5f";
const KEY = "media/2026/10/0b0e7c2e-6c55-4c62-9a43-1b3f2c3d4e5f.png";

function request(headers: HeadersInit = {}) {
  return GET(new Request(`https://oc.example/media/${ID}`, { headers }), {
    params: Promise.resolve({ id: ID }),
  });
}

beforeEach(() => {
  mocks.denied = null;
  mocks.getAsset.mockReset().mockResolvedValue({ storageKey: KEY, mimeType: "image/png" });
  mocks.get.mockReset().mockResolvedValue({
    body: new Response(PNG_1X1).body,
    size: PNG_1X1.byteLength,
  });
});

describe("GET /media/[id]", () => {
  it("answers 401 without a session, before any lookup", async () => {
    mocks.denied = new Response(null, { status: 401 });
    expect((await request()).status).toBe(401);
    expect(mocks.getAsset).not.toHaveBeenCalled();
    expect(mocks.get).not.toHaveBeenCalled();
  });

  it("streams the stored image with the detected type and private, immutable caching", async () => {
    const response = await request();
    expect(response.status).toBe(200);
    expect(mocks.get).toHaveBeenCalledWith(KEY);
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(PNG_1X1);
    expect(Object.fromEntries(response.headers)).toMatchObject({
      "content-type": "image/png",
      "content-length": String(PNG_1X1.byteLength),
      "cache-control": "private, max-age=31536000, immutable",
      etag: `"${ID}"`,
      "x-content-type-options": "nosniff",
    });
  });

  it("revalidates from the id alone (304, no database or store read)", async () => {
    const response = await request({ "If-None-Match": `"${ID}"` });
    expect(response.status).toBe(304);
    expect(mocks.getAsset).not.toHaveBeenCalled();
    expect(mocks.get).not.toHaveBeenCalled();
  });

  it("answers 404 for unknown ids and missing files", async () => {
    mocks.getAsset.mockRejectedValueOnce(
      new RepositoryError("not_found", { entity: "media_asset", id: ID }),
    );
    expect((await request()).status).toBe(404);
    mocks.get.mockResolvedValueOnce(null);
    expect((await request()).status).toBe(404);
  });
});
