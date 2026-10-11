import "server-only";

import { createHash, createHmac, timingSafeEqual } from "node:crypto";

import { AUTH_LIMITS } from "./constants";

/**
 * Stateless session cookie: `v1.<expiresAtMs>.<HMAC-SHA256>`. There is one user, so the token
 * carries no identity — only "signed by this server, not expired".
 */
const VERSION = "v1";

/**
 * The signing key mixes in the password, so changing APP_PASSWORD (or AUTH_SECRET) invalidates
 * every existing session without any server-side session store.
 */
export function deriveSigningKey(secret: string, password: string): Buffer {
  return createHmac("sha256", secret).update("oc-studio/session/v1\0").update(password).digest();
}

function sign(key: Buffer, payload: string): Buffer {
  return createHmac("sha256", key).update(payload).digest();
}

export function createSessionToken(
  key: Buffer,
  now = Date.now(),
): { token: string; expiresAt: Date } {
  const expiresAt = now + AUTH_LIMITS.sessionTtlMs;
  const payload = `${VERSION}.${expiresAt}`;
  return {
    token: `${payload}.${sign(key, payload).toString("base64url")}`,
    expiresAt: new Date(expiresAt),
  };
}

export function verifySessionToken(token: string | undefined, key: Buffer, now = Date.now()) {
  if (!token || token.length > 200) return false;
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  const [version, expiry, signature] = parts as [string, string, string];
  if (version !== VERSION || !/^\d{1,16}$/.test(expiry)) return false;

  const expected = sign(key, `${version}.${expiry}`);
  const given = Buffer.from(signature, "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return false;

  const expiresAt = Number(expiry);
  // A signed expiry beyond the TTL can only come from a different server config: reject it.
  return expiresAt > now && expiresAt <= now + AUTH_LIMITS.sessionTtlMs;
}

/** Constant-time comparison; hashing first hides the expected length. */
export function passwordMatches(candidate: string, expected: string): boolean {
  const digest = (value: string) => createHash("sha256").update(value, "utf8").digest();
  return timingSafeEqual(digest(candidate), digest(expected));
}
