import { describe, expect, it } from "vitest";

import { connectTestDatabase } from "@/test/integration-context";

import { LoginRateLimiter, TOTAL_KEY } from "../rate-limit";

import { createLoginFailureStore } from "./login-failure-store";

const { db } = connectTestDatabase();
const WINDOW = 60_000;

function limiter(now: { value: number }, maxPerClient = 3, maxTotal = 10) {
  return new LoginRateLimiter(
    createLoginFailureStore(db),
    { windowMs: WINDOW, maxPerClient, maxTotal },
    () => now.value,
  );
}

describe("login failure store (Postgres)", () => {
  it("counts failures per client and in total, shared by every instance", async () => {
    const now = { value: Date.UTC(2026, 9, 11, 8) };
    // Two "instances" (separate limiter objects) see the same counters.
    const a = limiter(now);
    const b = limiter(now);
    await a.recordFailure("ip:1.2.3.4");
    await b.recordFailure("ip:1.2.3.4");
    await a.recordFailure("ip:1.2.3.4");
    expect(await b.check("ip:1.2.3.4")).toEqual({ allowed: false, retryAfterMs: WINDOW });
    expect((await b.check("ip:5.6.7.8")).allowed).toBe(true);

    const buckets = await createLoginFailureStore(db).read(["ip:1.2.3.4", TOTAL_KEY]);
    expect(buckets.get(TOTAL_KEY)?.failures).toBe(3);
  });

  it("counts concurrent failures exactly once each", async () => {
    const now = { value: Date.UTC(2026, 9, 11, 9) };
    const shared = limiter(now, 100, 100);
    await Promise.all(Array.from({ length: 8 }, () => shared.recordFailure("ip:9.9.9.9")));
    const buckets = await createLoginFailureStore(db).read(["ip:9.9.9.9"]);
    expect(buckets.get("ip:9.9.9.9")?.failures).toBe(8);
  });

  it("starts a new window after the old one ended, and resets on success", async () => {
    const now = { value: Date.UTC(2026, 9, 11, 10) };
    const l = limiter(now);
    for (let i = 0; i < 3; i++) await l.recordFailure("ip:1.1.1.1");
    expect((await l.check("ip:1.1.1.1")).allowed).toBe(false);
    now.value += WINDOW;
    expect((await l.check("ip:1.1.1.1")).allowed).toBe(true);
    await l.recordFailure("ip:1.1.1.1");
    expect((await createLoginFailureStore(db).read(["ip:1.1.1.1"])).get("ip:1.1.1.1")).toEqual({
      failures: 1,
      windowStart: now.value,
    });
    await l.reset("ip:1.1.1.1");
    expect((await createLoginFailureStore(db).read(["ip:1.1.1.1"])).size).toBe(0);
  });
});
