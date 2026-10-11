import type { FailureBucket, LoginFailureStore } from "@/features/auth/rate-limit";

/** Unit-test double with the same semantics as the Postgres store (no database needed). */
export function createMemoryLoginFailureStore(): LoginFailureStore & {
  buckets: Map<string, FailureBucket>;
} {
  const buckets = new Map<string, FailureBucket>();
  return {
    buckets,
    read: async (keys) =>
      new Map(keys.flatMap((key) => (buckets.has(key) ? [[key, buckets.get(key)!]] : []))),
    increment: async (keys, now, windowMs) => {
      for (const key of keys) {
        const bucket = buckets.get(key);
        buckets.set(
          key,
          !bucket || bucket.windowStart <= now - windowMs
            ? { failures: 1, windowStart: now }
            : { failures: bucket.failures + 1, windowStart: bucket.windowStart },
        );
      }
    },
    remove: async (key) => {
      buckets.delete(key);
    },
    prune: async (before) => {
      for (const [key, bucket] of buckets) if (bucket.windowStart <= before) buckets.delete(key);
    },
  };
}
