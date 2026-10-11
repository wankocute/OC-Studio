// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { loginAction } from "./actions";
import { SESSION_COOKIE } from "./constants";
import { createMemoryLoginFailureStore } from "@/test/memory-login-failure-store";

import { LoginRateLimiter } from "./rate-limit";
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

let store = createMemoryLoginFailureStore();
vi.mock("@/db", () => ({ getDb: () => ({}) }));
vi.mock("./server/login-failure-store", () => ({ createLoginFailureStore: () => store }));

function form(password: string, next?: string) {
  const data = new FormData();
  data.set("password", password);
  if (next !== undefined) data.set("next", next);
  return data;
}

beforeEach(() => {
  setCookies.length = 0;
  clientIp = `203.0.113.${Math.floor(Math.random() * 250)}`;
  store = createMemoryLoginFailureStore();
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("APP_PASSWORD", PASSWORD);
  vi.stubEnv("AUTH_SECRET", SECRET);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

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
    expect((await new LoginRateLimiter(store).check("ip:someone-else")).allowed).toBe(true);
  });

  it("fails closed when the failure counters cannot be read", async () => {
    store.read = async () => {
      throw new Error("database down");
    };
    vi.spyOn(console, "error").mockImplementation(() => {});
    const result = await loginAction(null, form(PASSWORD));
    expect(result).toMatchObject({ ok: false });
    expect(setCookies).toHaveLength(0);
  });

  it("refuses to log in when the server is misconfigured", async () => {
    vi.stubEnv("AUTH_SECRET", "");
    const result = await loginAction(null, form(PASSWORD));
    expect(result).toMatchObject({ ok: false, error: { code: "unauthenticated" } });
    expect(setCookies).toHaveLength(0);
  });
});
