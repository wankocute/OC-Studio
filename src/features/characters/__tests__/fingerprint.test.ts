import { describe, expect, it } from "vitest";

import {
  type CharacterFacts,
  canonicalJson,
  computeFactFingerprints,
  diffFactFingerprints,
  findStaleRefs,
  fingerprint,
  itemRef,
} from "../domain";

import { sampleContemporary } from "./fixtures/sample-characters";

const LIKES = "personality.likes";

function withValues(values: CharacterFacts["values"]): CharacterFacts {
  return { ...sampleContemporary, values: { ...sampleContemporary.values, ...values } };
}

function likes(facts: CharacterFacts) {
  const fact = facts.values[LIKES];
  if (fact?.state !== "specified") throw new Error("fixture changed");
  return fact.value as { id: string; text: string }[];
}

describe("canonical fingerprint", () => {
  it("ignores object key order but not array order", () => {
    expect(canonicalJson({ b: 1, a: [2, 1] })).toBe(canonicalJson({ a: [2, 1], b: 1 }));
    expect(fingerprint([1, 2])).not.toBe(fingerprint([2, 1]));
  });

  it("treats composed and decomposed Vietnamese as the same text", () => {
    expect(fingerprint("Nguyễn".normalize("NFD"))).toBe(fingerprint("Nguyễn".normalize("NFC")));
    expect(fingerprint("Nguyễn")).not.toBe(fingerprint("Nguyen"));
  });

  it("is deterministic and prefixed with its algorithm", () => {
    expect(fingerprint({ a: 1 })).toBe(fingerprint({ a: 1 }));
    expect(fingerprint({ a: 1 })).toMatch(/^c53:[0-9a-f]{14}$/);
  });
});

describe("computeFactFingerprints", () => {
  const base = computeFactFingerprints(sampleContemporary);

  it("addresses fields and repeated items by stable ids", () => {
    expect(base).toHaveProperty("displayName");
    expect(base).toHaveProperty("identity.age");
    expect(base).toHaveProperty(itemRef(LIKES, "like_mua"));
    expect(base).toHaveProperty(itemRef("relationships.entries", "rel_khai"));
    expect(base).not.toHaveProperty("appearance.weight"); // unspecified
  });

  it("reordering a list changes only the field fingerprint", () => {
    const reordered = withValues({
      [LIKES]: { state: "specified", value: [...likes(sampleContemporary)].reverse() },
    });
    expect(diffFactFingerprints(base, computeFactFingerprints(reordered))).toEqual({
      added: [],
      changed: [LIKES],
      removed: [],
    });
  });

  it("editing one item marks only that item (and its field)", () => {
    const [first, second] = likes(sampleContemporary);
    const edited = withValues({
      [LIKES]: { state: "specified", value: [first!, { ...second!, text: "Cà phê trứng" }] },
    });
    const diff = diffFactFingerprints(base, computeFactFingerprints(edited));
    expect(diff.changed.sort()).toEqual([LIKES, itemRef(LIKES, "like_ca_phe")].sort());
  });

  it("detects added and removed items", () => {
    const [first] = likes(sampleContemporary);
    const changed = withValues({
      [LIKES]: { state: "specified", value: [first!, { id: "like_moi", text: "Sương sớm" }] },
    });
    const diff = diffFactFingerprints(base, computeFactFingerprints(changed));
    expect(diff.added).toEqual([itemRef(LIKES, "like_moi")]);
    expect(diff.removed).toEqual([itemRef(LIKES, "like_ca_phe")]);
  });

  it("detects state changes (specified → not_applicable)", () => {
    const changed = withValues({ "identity.nationality": { state: "not_applicable" } });
    expect(diffFactFingerprints(base, computeFactFingerprints(changed)).changed).toEqual([
      "identity.nationality",
    ]);
  });
});

describe("findStaleRefs", () => {
  it("flags content whose source facts changed or were removed", () => {
    const current = computeFactFingerprints(sampleContemporary);
    const usedBySection = {
      "identity.age": current["identity.age"]!,
      [itemRef(LIKES, "like_mua")]: current[itemRef(LIKES, "like_mua")]!,
    };
    expect(findStaleRefs(usedBySection, current)).toEqual([]);

    const rest = { ...sampleContemporary.values };
    delete rest["identity.age"];
    const later = computeFactFingerprints({ ...sampleContemporary, values: rest });
    expect(findStaleRefs(usedBySection, later)).toEqual(["identity.age"]);
  });

  it("is unaffected by edits to facts the content did not use", () => {
    const current = computeFactFingerprints(sampleContemporary);
    const used = { "identity.age": current["identity.age"]! };
    const edited = withValues({ "appearance.hair_color": { state: "specified", value: "Đen" } });
    expect(findStaleRefs(used, computeFactFingerprints(edited))).toEqual([]);
  });
});
