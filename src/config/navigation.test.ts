import { describe, expect, it } from "vitest";

import { findActiveNavItem } from "./navigation";

describe("findActiveNavItem", () => {
  it("matches the dashboard only on the root path", () => {
    expect(findActiveNavItem("/")?.href).toBe("/");
  });

  it("matches nested paths to their section", () => {
    expect(findActiveNavItem("/characters")?.href).toBe("/characters");
    expect(findActiveNavItem("/characters/abc")?.href).toBe("/characters");
    expect(findActiveNavItem("/settings")?.href).toBe("/settings");
  });

  it("does not match on a shared prefix", () => {
    expect(findActiveNavItem("/characters-archive")).toBeUndefined();
  });
});
