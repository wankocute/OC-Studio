import { afterEach, describe, expect, it, vi } from "vitest";

import { getServerEnv, InvalidServerEnvError, parseServerEnv } from "./env";

afterEach(() => vi.unstubAllEnvs());

describe("parseServerEnv", () => {
  it("reads updated AI variables instead of retaining the first environment snapshot", () => {
    vi.stubEnv("AI_PROVIDER", "gemini");
    vi.stubEnv("GEMINI_API_KEY", "");
    vi.stubEnv("GEMINI_MODEL", "");
    expect(getServerEnv().GEMINI_API_KEY).toBeUndefined();
    vi.stubEnv("GEMINI_API_KEY", "test-key");
    vi.stubEnv("GEMINI_MODEL", " gemini-3.8-flash ");
    expect(getServerEnv()).toMatchObject({
      GEMINI_API_KEY: "test-key",
      GEMINI_MODEL: "gemini-3.8-flash",
    });
  });
  it("accepts a postgres URL", () => {
    const env = parseServerEnv({ DATABASE_URL: "postgresql://user:pass@localhost:5432/oc_studio" });
    expect(env.DATABASE_URL).toBe("postgresql://user:pass@localhost:5432/oc_studio");
  });

  it("accepts the postgres:// scheme", () => {
    expect(parseServerEnv({ DATABASE_URL: "postgres://localhost/db" }).DATABASE_URL).toBeDefined();
  });

  it("treats missing or blank DATABASE_URL as not configured", () => {
    expect(parseServerEnv({}).DATABASE_URL).toBeUndefined();
    expect(parseServerEnv({ DATABASE_URL: "   " }).DATABASE_URL).toBeUndefined();
  });

  it("rejects non-postgres URLs", () => {
    expect(() => parseServerEnv({ DATABASE_URL: "mysql://localhost/db" })).toThrow(
      InvalidServerEnvError,
    );
    expect(() => parseServerEnv({ DATABASE_URL: "not a url" })).toThrow(InvalidServerEnvError);
  });

  it("defaults NODE_ENV to development", () => {
    expect(parseServerEnv({}).NODE_ENV).toBe("development");
  });
  it("names an invalid provider without including secrets in schema errors", () => {
    try {
      parseServerEnv({
        AI_PROVIDER: "unsupported",
        GEMINI_API_KEY: "private-key",
        DATABASE_URL: "private-database-url",
      });
      expect.fail("Invalid environment must be rejected");
    } catch (error) {
      expect(error).toBeInstanceOf(InvalidServerEnvError);
      expect((error as Error).message).toContain("AI_PROVIDER");
      expect((error as Error).message).not.toContain("private-key");
      expect((error as Error).message).not.toContain("private-database-url");
    }
  });
});
