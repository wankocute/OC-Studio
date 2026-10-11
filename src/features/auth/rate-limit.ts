import { AUTH_LIMITS } from "./constants";

type Bucket = { failures: number; windowStart: number };

export type RateLimitCheck = { allowed: true } | { allowed: false; retryAfterMs: number };

type Options = {
  windowMs: number;
  maxPerClient: number;
  maxTotal: number;
  maxTrackedClients: number;
};

const DEFAULT_OPTIONS: Options = {
  windowMs: AUTH_LIMITS.failureWindowMs,
  maxPerClient: AUTH_LIMITS.maxFailuresPerClient,
  maxTotal: AUTH_LIMITS.maxFailuresTotal,
  maxTrackedClients: AUTH_LIMITS.maxTrackedClients,
};

/**
 * Fixed-window counter of failed logins, per client and in total. In memory: the app runs as a
 * single instance, and a restart resetting the counters is acceptable for one user.
 */
export class LoginRateLimiter {
  private readonly clients = new Map<string, Bucket>();
  private total: Bucket = { failures: 0, windowStart: 0 };

  constructor(
    private readonly options: Options = DEFAULT_OPTIONS,
    private readonly now: () => number = Date.now,
  ) {}

  check(client: string): RateLimitCheck {
    const now = this.now();
    const blockedUntil = Math.max(
      this.blockedUntil(this.clients.get(client), this.options.maxPerClient, now),
      this.blockedUntil(this.total, this.options.maxTotal, now),
    );
    return blockedUntil > now
      ? { allowed: false, retryAfterMs: blockedUntil - now }
      : { allowed: true };
  }

  recordFailure(client: string): void {
    const now = this.now();
    this.total = this.bump(this.total, now);
    if (!this.clients.has(client) && this.clients.size >= this.options.maxTrackedClients) {
      this.prune(now);
    }
    this.clients.set(client, this.bump(this.clients.get(client), now));
  }

  /** After a successful login, that client's earlier mistakes no longer count. */
  reset(client: string): void {
    this.clients.delete(client);
  }

  private bump(bucket: Bucket | undefined, now: number): Bucket {
    if (!bucket || now - bucket.windowStart >= this.options.windowMs) {
      return { failures: 1, windowStart: now };
    }
    return { failures: bucket.failures + 1, windowStart: bucket.windowStart };
  }

  private blockedUntil(bucket: Bucket | undefined, max: number, now: number): number {
    if (!bucket || bucket.failures < max) return 0;
    const end = bucket.windowStart + this.options.windowMs;
    return end > now ? end : 0;
  }

  private prune(now: number): void {
    for (const [key, bucket] of this.clients) {
      if (now - bucket.windowStart >= this.options.windowMs) this.clients.delete(key);
    }
    // Still full: drop the oldest entries (Map keeps insertion order).
    for (const key of this.clients.keys()) {
      if (this.clients.size < this.options.maxTrackedClients) break;
      this.clients.delete(key);
    }
  }
}

const globalForAuth = globalThis as typeof globalThis & {
  __ocStudioLoginLimiter?: LoginRateLimiter;
};

/** Process-wide limiter, kept across dev hot reloads. */
export function getLoginRateLimiter(): LoginRateLimiter {
  globalForAuth.__ocStudioLoginLimiter ??= new LoginRateLimiter();
  return globalForAuth.__ocStudioLoginLimiter;
}

/**
 * Best-effort client key. Proxies append the address they saw to X-Forwarded-For, so the last
 * entry comes from the nearest proxy rather than the client; the total cap covers the rest.
 */
export function clientKeyFromHeaders(headers: Pick<Headers, "get">): string {
  const forwarded = headers.get("x-forwarded-for");
  const last = forwarded?.split(",").at(-1)?.trim();
  return (last || headers.get("x-real-ip")?.trim() || "unknown").slice(0, 100);
}
