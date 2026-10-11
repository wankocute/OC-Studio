// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SESSION_COOKIE } from "../constants";
import { createSessionToken, deriveSigningKey } from "../session-token";

import { rejectUnauthenticatedAction, rejectUnauthenticatedRequest } from "./session";

const PASSWORD = "pw";
const SECRET = "0123456789abcdef0123456789abcdef";
const cookieJar = new Map<string, string>();

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (cookieJar.has(name) ? { name, value: cookieJar.get(name) } : undefined),
  }),
}));

beforeEach(() => {
  cookieJar.clear();
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("APP_PASSWORD", PASSWORD);
  vi.stubEnv("AUTH_SECRET", SECRET);
});
afterEach(() => vi.unstubAllEnvs());

describe("server-side checks (independent of the proxy)", () => {
  it("refuses Server Actions without a valid session", async () => {
    expect(await rejectUnauthenticatedAction()).toMatchObject({
      ok: false,
      error: { code: "unauthenticated" },
    });
    cookieJar.set(SESSION_COOKIE, "v1.1.forged");
    expect(await rejectUnauthenticatedAction()).toMatchObject({ ok: false });
  });

  it("lets Server Actions run with a valid session", async () => {
    cookieJar.set(SESSION_COOKIE, createSessionToken(deriveSigningKey(SECRET, PASSWORD)).token);
    expect(await rejectUnauthenticatedAction()).toBeNull();
    expect(await rejectUnauthenticatedRequest()).toBeNull();
  });

  it("answers Route Handlers with 401, or 503 when misconfigured", async () => {
    expect((await rejectUnauthenticatedRequest())?.status).toBe(401);
    vi.stubEnv("AUTH_SECRET", "");
    expect((await rejectUnauthenticatedRequest())?.status).toBe(503);
    expect(await rejectUnauthenticatedAction()).toMatchObject({
      ok: false,
      error: { code: "unauthenticated", message: expect.stringContaining("AUTH_SECRET") },
    });
  });
});
