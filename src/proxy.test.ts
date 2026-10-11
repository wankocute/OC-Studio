// @vitest-environment node
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SESSION_COOKIE } from "@/features/auth/constants";
import { createSessionToken, deriveSigningKey } from "@/features/auth/session-token";

import { config, proxy } from "./proxy";

const PASSWORD = "mật khẩu thử";
const SECRET = "0123456789abcdef0123456789abcdef";

function request(path: string, init: { method?: string; cookie?: string } = {}) {
  return new NextRequest(new URL(path, "https://oc.example"), {
    method: init.method ?? "GET",
    headers: init.cookie ? { cookie: `${SESSION_COOKIE}=${init.cookie}` } : {},
  });
}

const validToken = () => createSessionToken(deriveSigningKey(SECRET, PASSWORD)).token;

afterEach(() => vi.unstubAllEnvs());

describe("proxy with login configured (production)", () => {
  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("APP_PASSWORD", PASSWORD);
    vi.stubEnv("AUTH_SECRET", SECRET);
  });

  it("redirects anonymous page requests to /login", () => {
    const response = proxy(request("/characters?sort=name"));
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://oc.example/login?next=%2Fcharacters%3Fsort%3Dname",
    );
  });

  it.each([
    ["/api/health", "GET"],
    ["/media/0b0e7c2e-6c55-4c62-9a43-1b3f2c3d4e5f", "GET"],
    ["/characters/abc", "POST"],
  ])("returns 401 for anonymous %s %s", (path, method) => {
    expect(proxy(request(path, { method })).status).toBe(401);
  });

  it("rejects forged, expired and stale cookies", () => {
    const expired = createSessionToken(
      deriveSigningKey(SECRET, PASSWORD),
      Date.now() - 31 * 24 * 60 * 60 * 1000,
    ).token;
    const otherPassword = createSessionToken(deriveSigningKey(SECRET, "old password")).token;
    for (const cookie of ["v1.9999999999999.forged", expired, otherPassword]) {
      expect(proxy(request("/api/health", { cookie })).status).toBe(401);
    }
  });

  it("lets a valid session through", () => {
    const response = proxy(request("/media/x", { cookie: validToken() }));
    expect(response.status).toBe(200);
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it("serves the login page to anonymous visitors only", () => {
    expect(proxy(request("/login")).headers.get("x-middleware-next")).toBe("1");
    expect(proxy(request("/login", { cookie: validToken() })).headers.get("location")).toBe(
      "https://oc.example/",
    );
  });
});

describe("proxy fails closed", () => {
  it.each([
    ["no variables", {}],
    ["no secret", { APP_PASSWORD: PASSWORD }],
    ["no password", { AUTH_SECRET: SECRET }],
  ])(
    "refuses every request in production with %s",
    async (_label, vars: Record<string, string>) => {
      vi.stubEnv("NODE_ENV", "production");
      vi.stubEnv("APP_PASSWORD", vars.APP_PASSWORD ?? "");
      vi.stubEnv("AUTH_SECRET", vars.AUTH_SECRET ?? "");
      for (const path of ["/", "/login", "/media/x"]) {
        const response = proxy(request(path, { cookie: validToken() }));
        expect(response.status).toBe(503);
        expect(await response.text()).toContain("chưa cấu hình đăng nhập");
      }
    },
  );

  it("refuses a too-short AUTH_SECRET", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("APP_PASSWORD", PASSWORD);
    vi.stubEnv("AUTH_SECRET", "short");
    expect(proxy(request("/")).status).toBe(503);
  });

  it("stays open in development when both variables are blank", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("APP_PASSWORD", "");
    vi.stubEnv("AUTH_SECRET", "");
    expect(proxy(request("/characters", { method: "POST" })).headers.get("x-middleware-next")).toBe(
      "1",
    );
  });
});

describe("proxy matcher", () => {
  const matcher = new RegExp(`^${config.matcher[0]}$`);

  it("covers pages, API, media and actions but not build assets", () => {
    for (const path of ["/", "/login", "/api/health", "/media/abc", "/characters/a/edit"]) {
      expect(matcher.test(path)).toBe(true);
    }
    for (const path of ["/_next/static/chunks/a.js", "/_next/image", "/favicon.ico"]) {
      expect(matcher.test(path)).toBe(false);
    }
  });
});
