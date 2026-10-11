// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

import { loadAuthConfig, resolveAuthConfig } from "./config";

const SECRET = "s".repeat(32);

afterEach(() => vi.unstubAllEnvs());

describe("resolveAuthConfig (fail closed)", () => {
  it("is enabled when both variables are set, with secure cookies in production only", () => {
    const production = resolveAuthConfig({
      APP_PASSWORD: "pw",
      AUTH_SECRET: SECRET,
      NODE_ENV: "production",
    });
    expect(production).toMatchObject({ status: "enabled", secureCookie: true });
    expect(
      resolveAuthConfig({ APP_PASSWORD: "pw", AUTH_SECRET: SECRET, NODE_ENV: "development" }),
    ).toMatchObject({ status: "enabled", secureCookie: false });
  });

  it("refuses to run in production without a password or secret", () => {
    expect(resolveAuthConfig({ NODE_ENV: "production" })).toMatchObject({
      status: "misconfigured",
      reason: expect.stringContaining("APP_PASSWORD, AUTH_SECRET"),
    });
    expect(resolveAuthConfig({ APP_PASSWORD: "pw", NODE_ENV: "production" })).toMatchObject({
      status: "misconfigured",
      reason: expect.stringContaining("AUTH_SECRET"),
    });
    expect(resolveAuthConfig({ AUTH_SECRET: SECRET, NODE_ENV: "production" })).toMatchObject({
      status: "misconfigured",
      reason: expect.stringContaining("APP_PASSWORD"),
    });
  });

  it("allows running without login only outside production, and only when both are blank", () => {
    expect(resolveAuthConfig({ NODE_ENV: "development" })).toEqual({ status: "disabled" });
    expect(resolveAuthConfig({ NODE_ENV: "test" })).toEqual({ status: "disabled" });
    expect(resolveAuthConfig({ APP_PASSWORD: "pw", NODE_ENV: "development" }).status).toBe(
      "misconfigured",
    );
  });
});

describe("loadAuthConfig", () => {
  it("treats blank variables as missing", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("APP_PASSWORD", "   ");
    vi.stubEnv("AUTH_SECRET", "");
    expect(loadAuthConfig().status).toBe("misconfigured");
  });

  it("fails closed on an invalid environment without echoing the secret", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("APP_PASSWORD", "pw");
    vi.stubEnv("AUTH_SECRET", "too-short-secret");
    const config = loadAuthConfig();
    expect(config.status).toBe("misconfigured");
    if (config.status !== "misconfigured") return;
    expect(config.reason).toContain("AUTH_SECRET");
    expect(config.reason).not.toContain("too-short-secret");
  });
});
