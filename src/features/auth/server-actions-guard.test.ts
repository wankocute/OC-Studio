// @vitest-environment node
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import ts from "typescript";
import { describe, expect, it } from "vitest";

/** Actions that must work without a session. */
const PUBLIC_ACTIONS = new Set(["loginAction"]);
const GUARD = "rejectUnauthenticatedAction";

function serverActionFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return serverActionFiles(full);
    if (!/\.tsx?$/.test(entry.name) || /\.test\.tsx?$/.test(entry.name)) return [];
    return /^\s*["']use server["']/.test(readFileSync(full, "utf8")) ? [full] : [];
  });
}

/** Exported async functions whose first statement does not call the guard. */
function unguardedActions(file: string): string[] {
  const source = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest);
  const missing: string[] = [];
  source.forEachChild((node) => {
    if (!ts.isFunctionDeclaration(node) || !node.body || !node.name) return;
    const exported = node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
    if (!exported || PUBLIC_ACTIONS.has(node.name.text)) return;
    const first = node.body.statements[0];
    if (!first || !first.getText(source).includes(`await ${GUARD}()`)) {
      missing.push(`${path.relative(process.cwd(), file)}: ${node.name.text}`);
    }
  });
  return missing;
}

describe("Server Actions", () => {
  it("all check the session first (the proxy is not the only gate)", () => {
    const files = serverActionFiles(path.join(process.cwd(), "src"));
    expect(files.length).toBeGreaterThan(5);
    expect(files.flatMap(unguardedActions)).toEqual([]);
  });
});
