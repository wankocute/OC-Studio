import { describe, expect, it } from "vitest";

import { clientKeyFromHeaders, LoginRateLimiter } from "./rate-limit";

function setup(overrides: Partial<ConstructorParameters<typeof LoginRateLimiter>[0]> = {}) {
  let now = 1_000_000;
  const limiter = new LoginRateLimiter(
    { windowMs: 60_000, maxPerClient: 3, maxTotal: 10, maxTrackedClients: 100, ...overrides },
    () => now,
  );
  return { limiter, advance: (ms: number) => (now += ms) };
}

describe("LoginRateLimiter", () => {
  it("blocks a client after too many failures until the window ends", () => {
    const { limiter, advance } = setup();
    for (let i = 0; i < 3; i++) {
      expect(limiter.check("a").allowed).toBe(true);
      limiter.recordFailure("a");
    }
    expect(limiter.check("a")).toEqual({ allowed: false, retryAfterMs: 60_000 });
    expect(limiter.check("b").allowed).toBe(true);

    advance(59_999);
    expect(limiter.check("a").allowed).toBe(false);
    advance(1);
    expect(limiter.check("a").allowed).toBe(true);
  });

  it("caps total failures across clients (rotating IPs)", () => {
    const { limiter } = setup({ maxPerClient: 100, maxTotal: 4 });
    for (const client of ["a", "b", "c", "d"]) limiter.recordFailure(client);
    expect(limiter.check("fresh-client").allowed).toBe(false);
  });

  it("forgets a client's failures after a successful login", () => {
    const { limiter } = setup();
    limiter.recordFailure("a");
    limiter.recordFailure("a");
    limiter.reset("a");
    limiter.recordFailure("a");
    limiter.recordFailure("a");
    expect(limiter.check("a").allowed).toBe(true);
  });

  it("keeps memory bounded", () => {
    const { limiter } = setup({ maxTrackedClients: 2, maxTotal: 1_000 });
    for (const client of ["a", "b", "c"]) limiter.recordFailure(client);
    // "a" was evicted to make room; its single failure no longer counts.
    for (let i = 0; i < 2; i++) limiter.recordFailure("a");
    expect(limiter.check("a").allowed).toBe(true);
  });
});

describe("clientKeyFromHeaders", () => {
  it("uses the address appended by the nearest proxy, not the client-supplied one", () => {
    const headers = new Headers({ "x-forwarded-for": "1.1.1.1, 203.0.113.9" });
    expect(clientKeyFromHeaders(headers)).toBe("203.0.113.9");
  });

  it("falls back to x-real-ip, then a shared key", () => {
    expect(clientKeyFromHeaders(new Headers({ "x-real-ip": "10.0.0.1" }))).toBe("10.0.0.1");
    expect(clientKeyFromHeaders(new Headers())).toBe("unknown");
  });
});
