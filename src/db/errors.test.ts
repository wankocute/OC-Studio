import { describe, expect, it } from "vitest";

import { describeDatabaseError } from "./errors";

function withCode(code: string) {
  return Object.assign(new Error("driver error"), { code });
}

describe("describeDatabaseError", () => {
  it.each([
    ["ECONNREFUSED", "connection_refused"],
    ["28P01", "authentication_failed"],
    ["3D000", "database_not_found"],
    ["ETIMEDOUT", "timeout"],
  ] as const)("maps code %s to %s", (code, reason) => {
    expect(describeDatabaseError(withCode(code)).reason).toBe(reason);
  });

  it("finds the code on a wrapped cause (Drizzle query errors)", () => {
    const wrapped = new Error("Failed query", { cause: withCode("28P01") });
    expect(describeDatabaseError(wrapped).reason).toBe("authentication_failed");
  });

  it("finds the code inside an AggregateError", () => {
    const aggregate = new AggregateError([withCode("ECONNREFUSED")], "connect failed");
    expect(describeDatabaseError(aggregate).reason).toBe("connection_refused");
  });

  it("detects timeouts by message", () => {
    expect(
      describeDatabaseError(new Error("Connection terminated due to connection timeout")).reason,
    ).toBe("timeout");
  });

  it("falls back to unknown", () => {
    const result = describeDatabaseError("boom");
    expect(result.reason).toBe("unknown");
    expect(result.message).toBeTruthy();
  });
});
