// @vitest-environment node
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const DOMAIN_DIR = join(process.cwd(), "src", "features", "characters", "domain");

/** The only non-relative import the domain layer may use. */
const ALLOWED_PACKAGES = new Set(["zod"]);

function importsOf(source: string): string[] {
  const specifiers = [...source.matchAll(/(?:import|export)[^"']*?from\s+["']([^"']+)["']/g)];
  const bare = [...source.matchAll(/import\s+["']([^"']+)["']/g)];
  const dynamic = [...source.matchAll(/import\(\s*["']([^"']+)["']\s*\)/g)];
  return [...specifiers, ...bare, ...dynamic].map((match) => match[1]!);
}

describe("character domain boundaries", () => {
  const files = readdirSync(DOMAIN_DIR).filter((file) => file.endsWith(".ts"));

  it("finds the domain files", () => {
    expect(files).toContain("schemas.ts");
  });

  it.each(files)("%s imports only zod and sibling domain modules", (file) => {
    const source = readFileSync(join(DOMAIN_DIR, file), "utf8");
    const forbidden = importsOf(source).filter(
      (specifier) => !specifier.startsWith("./") && !ALLOWED_PACKAGES.has(specifier),
    );
    // Rules out React, Next, Drizzle, pg, server-only, AI SDKs and app aliases (`@/…`).
    expect(forbidden).toEqual([]);
  });

  it.each(files)("%s has no client/server directives", (file) => {
    const source = readFileSync(join(DOMAIN_DIR, file), "utf8");
    expect(source).not.toMatch(/^["']use (client|server)["']/m);
  });
});
