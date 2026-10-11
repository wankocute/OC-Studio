import { describe, expect, it } from "vitest";

import { type AuthState, decideAccess, safeNextPath } from "./access";

function decide(pathname: string, auth: AuthState, method = "GET", search = "") {
  return decideAccess({ pathname, search, method, auth });
}

describe("decideAccess", () => {
  it("redirects anonymous page visits to the login page, remembering the target", () => {
    expect(decide("/characters/abc", "anonymous", "GET", "?view=grid")).toEqual({
      type: "redirect",
      location: "/login?next=%2Fcharacters%2Fabc%3Fview%3Dgrid",
    });
    expect(decide("/", "anonymous")).toEqual({ type: "redirect", location: "/login" });
  });

  it.each([
    ["/api/health", "GET"],
    ["/media/0b0e7c2e-6c55-4c62-9a43-1b3f2c3d4e5f", "GET"],
    // Server Actions (uploads, AI, every mutation) are POSTs to a page path.
    ["/characters/abc/edit", "POST"],
    ["/", "POST"],
  ])("refuses anonymous %s %s with 401", (path, method) => {
    expect(decide(path, "anonymous", method)).toEqual({ type: "unauthenticated" });
  });

  it("lets anonymous visitors reach only the login page and logout", () => {
    expect(decide("/login", "anonymous")).toEqual({ type: "allow" });
    expect(decide("/login", "anonymous", "POST")).toEqual({ type: "allow" });
    expect(decide("/logout", "anonymous", "POST")).toEqual({ type: "allow" });
    expect(decide("/login/extra", "anonymous")).toMatchObject({ type: "redirect" });
  });

  it("allows everything with a valid session and sends it away from the login page", () => {
    expect(decide("/media/x", "authenticated")).toEqual({ type: "allow" });
    expect(decide("/characters", "authenticated", "POST")).toEqual({ type: "allow" });
    expect(decide("/login", "authenticated")).toEqual({ type: "redirect", location: "/" });
  });

  it("refuses every path, including login, when misconfigured", () => {
    for (const path of ["/", "/login", "/logout", "/api/health", "/media/x"]) {
      expect(decide(path, "misconfigured")).toEqual({ type: "misconfigured" });
    }
  });

  it("lets everything through when login is disabled (local dev without a password)", () => {
    expect(decide("/characters", "disabled", "POST")).toEqual({ type: "allow" });
    expect(decide("/login", "disabled")).toEqual({ type: "redirect", location: "/" });
  });
});

describe("safeNextPath", () => {
  it("keeps same-site paths", () => {
    expect(safeNextPath("/characters/abc?view=grid")).toBe("/characters/abc?view=grid");
  });

  it.each([
    undefined,
    null,
    "",
    "characters",
    "https://evil.example",
    "//evil.example",
    "/\\evil.example",
    "/\tevil",
    "/a\\b",
    "/login",
    "/login?next=/x",
    "/logout",
    `/${"a".repeat(3000)}`,
  ])("falls back to / for %j", (raw) => {
    expect(safeNextPath(raw)).toBe("/");
  });
});
