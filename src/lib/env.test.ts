import { describe, expect, it } from "vitest";

import { InvalidServerEnvError, parseServerEnv } from "./env";

describe("parseServerEnv", () => {
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
});
