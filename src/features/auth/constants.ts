export const SESSION_COOKIE = "oc_session";

export const LOGIN_PATH = "/login";
export const LOGOUT_PATH = "/logout";

export const AUTH_LIMITS = {
  /** A session cookie is valid this long after login, then the user signs in again. */
  sessionTtlMs: 30 * 24 * 60 * 60 * 1000,
  /** Failed logins counted per window, per client and in total. */
  failureWindowMs: 15 * 60 * 1000,
  maxFailuresPerClient: 5,
  /**
   * Caps guessing even when an attacker rotates IPs (forwarded IPs can be spoofed). Low enough to
   * make brute force pointless, high enough that the owner is rarely caught by someone else's
   * attempts — and only until the window ends.
   */
  maxFailuresTotal: 25,
  /** Distinct clients tracked before old entries are pruned (memory bound). */
  maxTrackedClients: 5_000,
  maxPasswordLength: 1_000,
  maxNextPathLength: 2_000,
} as const;
