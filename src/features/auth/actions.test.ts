// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { loginAction } from "./actions";
import { SESSION_COOKIE } from "./constants";
import { getLoginRateLimiter } from "./rate-limit";
import { deriveSigningKey, verifySessionToken } from "./session-token";

const PASSWORD = "mật khẩu đúng";
const SECRET = "0123456789abcdef0123456789abcdef";

type SetCookie = { name: string; value: string; options: Record<string, unknown> };
const setCookies: SetCookie[] = [];
let clientIp = "203.0.113.1";

vi.mock("next/headers", () => ({
  cookies: async () => ({
    set: (name: string, value: string, options: Record<string, unknown>) =>
      setCookies.push({ name, value, options }),
  }),
  headers: async () => new Headers({ "x-forwarded-for": clientIp }),
}));

class RedirectSignal extends Error {
  constructor(readonly location: string) {
    super(`redirect:${location}`);
  }
}
vi.mock("next/navigation", () => ({
  redirect: (location: string) => {
    throw new RedirectSignal(location);
  },
}));

function form(password: string, next?: string) {
  const data = new FormData();
  data.set("password", password);
  if (next !== undefined) data.set("next", next);
  return data;
}

beforeEach(() => {
  setCookies.length = 0;
  clientIp = `203.0.113.${Math.floor(Math.random() * 250)}`;
  // A fresh limiter per test.
  (globalThis as { __ocStudioLoginLimiter?: unknown }).__ocStudioLoginLimiter = undefined;
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("APP_PASSWORD", PASSWORD);
  vi.stubEnv("AUTH_SECRET", SECRET);
});
afterEach(() => vi.unstubAllEnvs());

describe("loginAction", () => {
  it("sets a signed, httpOnly, secure, lax cookie and redirects to the safe target", async () => {
    await expect(loginAction(null, form(PASSWORD, "/characters?view=grid"))).rejects.toMatchObject({
      location: "/characters?view=grid",
    });
    expect(setCookies).toHaveLength(1);
    const [cookie] = setCookies;
    expect(cookie).toMatchObject({
      name: SESSION_COOKIE,
      options: { httpOnly: true, secure: true, sameSite: "lax", path: "/" },
    });
    expect(verifySessionToken(cookie!.value, deriveSigningKey(SECRET, PASSWORD))).toBe(true);
  });

  it("never redirects off-site", async () => {
    await expect(loginAction(null, form(PASSWORD, "//evil.example"))).rejects.toMatchObject({
      location: "/",
    });
  });

  it("rejects a wrong password without setting a cookie", async () => {
    const result = await loginAction(null, form("sai"));
    expect(result).toMatchObject({
      ok: false,
      error: { code: "invalid_input", fieldErrors: { password: "Mật khẩu không đúng." } },
    });
    expect(setCookies).toHaveLength(0);
  });

  it("locks a client out after repeated failures, even with the right password", async () => {
    for (let i = 0; i < 5; i++) await loginAction(null, form(`sai-${i}`));
    const result = await loginAction(null, form(PASSWORD));
    expect(result).toMatchObject({ ok: false, error: { code: "rate_limited" } });
    expect(setCookies).toHaveLength(0);
    expect(getLoginRateLimiter().check("someone-else").allowed).toBe(true);
  });

  it("refuses to log in when the server is misconfigured", async () => {
    vi.stubEnv("AUTH_SECRET", "");
    const result = await loginAction(null, form(PASSWORD));
    expect(result).toMatchObject({ ok: false, error: { code: "unauthenticated" } });
    expect(setCookies).toHaveLength(0);
  });
});
