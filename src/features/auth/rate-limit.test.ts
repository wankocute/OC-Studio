import { describe, expect, it } from "vitest";

import { createMemoryLoginFailureStore } from "@/test/memory-login-failure-store";

import { clientKeyFromHeaders, LoginRateLimiter, TOTAL_KEY } from "./rate-limit";

function setup(overrides: Partial<ConstructorParameters<typeof LoginRateLimiter>[1]> = {}) {
  let now = 1_000_000;
  const store = createMemoryLoginFailureStore();
  const limiter = new LoginRateLimiter(
    store,
    { windowMs: 60_000, maxPerClient: 3, maxTotal: 10, ...overrides },
    () => now,
  );
  return { limiter, store, advance: (ms: number) => (now += ms) };
}

describe("LoginRateLimiter", () => {
  it("blocks a client after too many failures until the window ends", async () => {
    const { limiter, advance } = setup();
    for (let i = 0; i < 3; i++) {
      expect((await limiter.check("ip:a")).allowed).toBe(true);
      await limiter.recordFailure("ip:a");
    }
    expect(await limiter.check("ip:a")).toEqual({ allowed: false, retryAfterMs: 60_000 });
    expect((await limiter.check("ip:b")).allowed).toBe(true);

    advance(59_999);
    expect((await limiter.check("ip:a")).allowed).toBe(false);
    advance(1);
    expect((await limiter.check("ip:a")).allowed).toBe(true);
  });

  it("caps total failures across clients (rotating IPs)", async () => {
    const { limiter } = setup({ maxPerClient: 100, maxTotal: 4 });
    for (const client of ["ip:a", "ip:b", "ip:c", "ip:d"]) await limiter.recordFailure(client);
    expect((await limiter.check("ip:fresh-client")).allowed).toBe(false);
  });

  it("forgets a client's failures after a successful login", async () => {
    const { limiter } = setup();
    await limiter.recordFailure("ip:a");
    await limiter.recordFailure("ip:a");
    await limiter.reset("ip:a");
    await limiter.recordFailure("ip:a");
    await limiter.recordFailure("ip:a");
    expect((await limiter.check("ip:a")).allowed).toBe(true);
  });

  it("prunes counters whose window has ended (bounded storage)", async () => {
    const { limiter, store, advance } = setup();
    await limiter.recordFailure("ip:a");
    advance(60_000);
    await limiter.recordFailure("ip:b");
    expect([...store.buckets.keys()].sort()).toEqual([TOTAL_KEY, "ip:b"].sort());
  });
});

describe("clientKeyFromHeaders", () => {
  it("uses the address appended by the nearest proxy, not the client-supplied one", () => {
    const headers = new Headers({ "x-forwarded-for": "1.1.1.1, 203.0.113.9" });
    expect(clientKeyFromHeaders(headers)).toBe("ip:203.0.113.9");
  });

  it("falls back to x-real-ip, then a shared key, and never collides with the total", () => {
    expect(clientKeyFromHeaders(new Headers({ "x-real-ip": "10.0.0.1" }))).toBe("ip:10.0.0.1");
    expect(clientKeyFromHeaders(new Headers())).toBe("ip:unknown");
    expect(clientKeyFromHeaders(new Headers({ "x-forwarded-for": TOTAL_KEY }))).not.toBe(TOTAL_KEY);
  });
});
