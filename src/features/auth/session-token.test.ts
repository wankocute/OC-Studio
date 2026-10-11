// @vitest-environment node
import { describe, expect, it } from "vitest";

import { AUTH_LIMITS } from "./constants";
import {
  createSessionToken,
  deriveSigningKey,
  passwordMatches,
  verifySessionToken,
} from "./session-token";

const SECRET = "x".repeat(32);
const key = deriveSigningKey(SECRET, "correct horse");
const NOW = Date.UTC(2026, 9, 11);

describe("session tokens", () => {
  it("accepts a fresh token and sets the expiry to the session TTL", () => {
    const { token, expiresAt } = createSessionToken(key, NOW);
    expect(verifySessionToken(token, key, NOW)).toBe(true);
    expect(expiresAt.getTime()).toBe(NOW + AUTH_LIMITS.sessionTtlMs);
  });

  it("rejects an expired token", () => {
    const { token } = createSessionToken(key, NOW);
    expect(verifySessionToken(token, key, NOW + AUTH_LIMITS.sessionTtlMs - 1)).toBe(true);
    expect(verifySessionToken(token, key, NOW + AUTH_LIMITS.sessionTtlMs)).toBe(false);
  });

  it("rejects a token whose expiry was edited", () => {
    const { token } = createSessionToken(key, NOW);
    const [version, expiry, signature] = token.split(".");
    const extended = `${version}.${Number(expiry) + 1}.${signature}`;
    expect(verifySessionToken(extended, key, NOW)).toBe(false);
  });

  it("rejects a token signed with another secret or after the password changed", () => {
    const { token } = createSessionToken(key, NOW);
    expect(verifySessionToken(token, deriveSigningKey("y".repeat(32), "correct horse"), NOW)).toBe(
      false,
    );
    expect(verifySessionToken(token, deriveSigningKey(SECRET, "new password"), NOW)).toBe(false);
  });

  it("rejects a validly signed expiry further away than the TTL allows", () => {
    const { token } = createSessionToken(key, NOW + AUTH_LIMITS.sessionTtlMs);
    expect(verifySessionToken(token, key, NOW)).toBe(false);
  });

  it.each([
    undefined,
    "",
    "garbage",
    "v1.123",
    "v2.1.abc",
    "v1.abc.def",
    "v1.1.2.3",
    "a".repeat(500),
  ])("rejects malformed token %#", (token) => {
    expect(verifySessionToken(token, key, NOW)).toBe(false);
  });
});

describe("passwordMatches", () => {
  it("matches only the exact password", () => {
    expect(passwordMatches("correct horse", "correct horse")).toBe(true);
    expect(passwordMatches("correct hors", "correct horse")).toBe(false);
    expect(passwordMatches("Correct horse", "correct horse")).toBe(false);
    expect(passwordMatches("", "correct horse")).toBe(false);
  });
});
