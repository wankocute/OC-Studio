import { AUTH_LIMITS } from "./constants";

export type FailureBucket = { failures: number; windowStart: number };

export type RateLimitCheck = { allowed: true } | { allowed: false; retryAfterMs: number };

/**
 * Where failure counters live. Production uses Postgres (`login-failure-store.ts`): on a
 * serverless host consecutive requests rarely share memory, so an in-process counter would let
 * an attacker spread guesses across instances.
 */
export interface LoginFailureStore {
  /** Current buckets of these keys; a missing key has no failures. */
  read(keys: readonly string[]): Promise<Map<string, FailureBucket>>;
  /**
   * Count one failure for each key in a single atomic step, starting a fresh window for a key
   * whose window ended at or before `now - windowMs`.
   */
  increment(keys: readonly string[], now: number, windowMs: number): Promise<void>;
  remove(key: string): Promise<void>;
  /** Forget buckets whose window started at or before `before` (bounded storage). */
  prune(before: number): Promise<void>;
}

type Options = { windowMs: number; maxPerClient: number; maxTotal: number };

const DEFAULT_OPTIONS: Options = {
  windowMs: AUTH_LIMITS.failureWindowMs,
  maxPerClient: AUTH_LIMITS.maxFailuresPerClient,
  maxTotal: AUTH_LIMITS.maxFailuresTotal,
};

/** Key of the counter shared by every client. Client keys always start with `ip:`. */
export const TOTAL_KEY = "*";

/** Fixed-window counter of failed logins, per client and in total. */
export class LoginRateLimiter {
  constructor(
    private readonly store: LoginFailureStore,
    private readonly options: Options = DEFAULT_OPTIONS,
    private readonly now: () => number = Date.now,
  ) {}

  async check(client: string): Promise<RateLimitCheck> {
    const now = this.now();
    const buckets = await this.store.read([client, TOTAL_KEY]);
    const blockedUntil = Math.max(
      this.blockedUntil(buckets.get(client), this.options.maxPerClient, now),
      this.blockedUntil(buckets.get(TOTAL_KEY), this.options.maxTotal, now),
    );
    return blockedUntil > now
      ? { allowed: false, retryAfterMs: blockedUntil - now }
      : { allowed: true };
  }

  async recordFailure(client: string): Promise<void> {
    const now = this.now();
    await this.store.increment([client, TOTAL_KEY], now, this.options.windowMs);
    await this.store.prune(now - this.options.windowMs);
  }

  /** After a successful login, that client's earlier mistakes no longer count. */
  async reset(client: string): Promise<void> {
    await this.store.remove(client);
  }

  private blockedUntil(bucket: FailureBucket | undefined, max: number, now: number): number {
    if (!bucket || bucket.failures < max) return 0;
    const end = bucket.windowStart + this.options.windowMs;
    return end > now ? end : 0;
  }
}

/**
 * Client key from the address the platform saw. Vercel overwrites X-Forwarded-For with the real
 * client address (one entry); behind other proxies the last entry comes from the nearest proxy
 * rather than the client. The total cap covers whatever a forged header could still bypass.
 */
export function clientKeyFromHeaders(headers: Pick<Headers, "get">): string {
  const forwarded = headers.get("x-forwarded-for");
  const last = forwarded?.split(",").at(-1)?.trim();
  return `ip:${(last || headers.get("x-real-ip")?.trim() || "unknown").slice(0, 100)}`;
}
