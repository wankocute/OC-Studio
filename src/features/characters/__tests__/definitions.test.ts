// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  BUILTIN_FIELDS,
  BUILTIN_GROUPS,
  type BuiltinFieldDefinition,
  factLabelsVi,
  fieldKeySchema,
  getBuiltinGroup,
  subfieldDefinitionSchema,
} from "../domain";

const fields: readonly BuiltinFieldDefinition[] = BUILTIN_FIELDS;

function selectConfigs() {
  const result: { path: string; codes: string[] }[] = [];
  for (const field of fields) {
    if (field.kind === "single_select" || field.kind === "multi_select") {
      result.push({ path: field.key, codes: field.options.map((option) => option.code) });
    }
    if (field.kind === "object" || field.kind === "object_list") {
      for (const sub of field.fields) {
        if (sub.kind === "single_select" || sub.kind === "multi_select") {
          result.push({
            path: `${field.key}.${sub.key}`,
            codes: sub.options.map((option) => option.code),
          });
        }
      }
    }
  }
  return result;
}

describe("built-in groups", () => {
  it("have unique ids and at most one level of sub-groups", () => {
    const ids = BUILTIN_GROUPS.map((group) => group.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const group of BUILTIN_GROUPS) {
      if (!("parent" in group)) continue;
      expect(getBuiltinGroup(group.parent)?.parent).toBeUndefined();
      expect(group.id.startsWith(`${group.parent}.`)).toBe(true);
    }
  });
});

describe("built-in fields", () => {
  it("have unique, well-formed, language-neutral keys", () => {
    const keys = fields.map((field) => field.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const key of keys) {
      expect(fieldKeySchema.safeParse(key).success, key).toBe(true);
      expect(key.startsWith("custom."), key).toBe(false);
    }
  });

  it("belong to an existing group whose top-level id prefixes the key", () => {
    for (const field of fields) {
      const group = getBuiltinGroup(field.group);
      expect(group, field.key).toBeDefined();
      const topLevel = group?.parent ?? group?.id;
      expect(field.key.startsWith(`${topLevel}.`), field.key).toBe(true);
    }
  });

  it("only nest leaf kinds inside objects, with unique sub-field keys", () => {
    for (const field of fields) {
      if (field.kind !== "object" && field.kind !== "object_list") continue;
      const keys = field.fields.map((sub) => sub.key);
      expect(new Set(keys).size, field.key).toBe(keys.length);
      expect(keys, field.key).not.toContain("id");
      for (const sub of field.fields) {
        expect(subfieldDefinitionSchema.safeParse(sub).success, `${field.key}.${sub.key}`).toBe(
          true,
        );
      }
    }
  });

  it("use unique option codes", () => {
    for (const { path, codes } of selectConfigs()) {
      expect(new Set(codes).size, path).toBe(codes.length);
    }
  });
});

describe("Vietnamese labels", () => {
  it("cover every group, field, sub-field, option and unit", () => {
    for (const group of BUILTIN_GROUPS)
      expect(factLabelsVi.groups[group.id], group.id).toBeTruthy();
    for (const field of fields) {
      expect(
        factLabelsVi.fields[field.key as keyof typeof factLabelsVi.fields],
        field.key,
      ).toBeTruthy();
      if (field.kind === "measure") {
        for (const unit of field.units) expect(factLabelsVi.units[unit], unit).toBeTruthy();
      }
      if (field.kind === "object" || field.kind === "object_list") {
        for (const sub of field.fields) {
          expect(
            factLabelsVi.subfields[`${field.key}.${sub.key}`],
            `${field.key}.${sub.key}`,
          ).toBeTruthy();
        }
      }
    }
    for (const { path, codes } of selectConfigs()) {
      for (const code of codes)
        expect(factLabelsVi.options[path]?.[code], `${path}:${code}`).toBeTruthy();
    }
  });

  it("have no labels for fields that do not exist", () => {
    const keys = new Set(fields.map((field) => field.key));
    for (const key of Object.keys(factLabelsVi.fields)) expect(keys.has(key), key).toBe(true);
  });
});

describe("documentation", () => {
  it("documents every built-in field key", () => {
    const doc = readFileSync(join(process.cwd(), "docs", "character-fact-schema.md"), "utf8");
    const missing = fields.map((field) => field.key).filter((key) => !doc.includes(`\`${key}\``));
    expect(missing).toEqual([]);
  });
});
