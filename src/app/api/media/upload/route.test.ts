// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createStorageKey } from "@/features/media/server/storage";
import { uploadTokenOptions } from "@/features/media/server/upload-token";

const mocks = vi.hoisted(() => ({
  denied: null as Response | null,
  handleUpload: vi.fn(),
}));
vi.mock("@/features/auth/server/session", () => ({
  rejectUnauthenticatedRequest: async () => mocks.denied,
}));
vi.mock("@vercel/blob/client", () => ({ handleUpload: mocks.handleUpload }));

import { POST } from "./route";

const tokenRequest = (pathname: string) =>
  new Request("https://oc.example/api/media/upload", {
    method: "POST",
    body: JSON.stringify({
      type: "blob.generate-client-token",
      payload: { pathname, multipart: false, clientPayload: null },
    }),
  });

beforeEach(() => {
  mocks.denied = null;
  mocks.handleUpload.mockReset();
  vi.stubEnv("BLOB_READ_WRITE_TOKEN", "vercel_blob_rw_test");
});
afterEach(() => vi.unstubAllEnvs());

describe("POST /api/media/upload", () => {
  it("issues no token without a session", async () => {
    mocks.denied = new Response(null, { status: 401 });
    const response = await POST(tokenRequest(createStorageKey("png")));
    expect(response.status).toBe(401);
    expect(mocks.handleUpload).not.toHaveBeenCalled();
  });

  it("issues a token with the image-only constraints for a server-shaped key", async () => {
    mocks.handleUpload.mockImplementation(async ({ onBeforeGenerateToken, body }) => {
      const options = await onBeforeGenerateToken(body.payload.pathname, null, false);
      return { type: "blob.generate-client-token", clientToken: "t", options };
    });
    const key = createStorageKey("png");
    const response = await POST(tokenRequest(key));
    expect(response.status).toBe(200);
    expect(mocks.handleUpload.mock.calls[0]![0].token).toBe("vercel_blob_rw_test");
    const { options } = (await response.json()) as { options: Record<string, unknown> };
    expect(options).toMatchObject({
      allowedContentTypes: ["image/png", "image/jpeg", "image/gif", "image/webp"],
      maximumSizeInBytes: 8 * 1024 * 1024,
      addRandomSuffix: false,
      allowOverwrite: false,
    });
  });

  it("refuses any other pathname and the upload-completed webhook", async () => {
    mocks.handleUpload.mockImplementation(async ({ onBeforeGenerateToken, body }) =>
      onBeforeGenerateToken(body.payload.pathname, null, false),
    );
    expect((await POST(tokenRequest("../other/file.html"))).status).toBe(400);
    const webhook = new Request("https://oc.example/api/media/upload", {
      method: "POST",
      body: JSON.stringify({ type: "blob.upload-completed", payload: {} }),
    });
    expect((await POST(webhook)).status).toBe(400);
  });

  it("answers 503 when Blob is not configured", async () => {
    vi.stubEnv("BLOB_READ_WRITE_TOKEN", "");
    expect((await POST(tokenRequest(createStorageKey("png")))).status).toBe(503);
  });
});

describe("uploadTokenOptions", () => {
  it("expires the token after a few minutes", () => {
    const now = Date.UTC(2026, 9, 11);
    expect(uploadTokenOptions(createStorageKey("webp"), now).validUntil).toBe(now + 10 * 60_000);
  });

  it.each(["media/2026/10/x.svg", "media/../../x.png", "/etc/passwd", ""])(
    "refuses %j",
    (pathname) => {
      expect(() => uploadTokenOptions(pathname)).toThrow();
    },
  );
});
