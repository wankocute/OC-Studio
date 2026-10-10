import { describe, expect, it } from "vitest";

import {
  assessFactSnapshot,
  type CharacterFacts,
  canonicalJson,
  createFactSnapshot,
  FINGERPRINT_ALGORITHM,
  fingerprintAlgorithm,
  computeFactFingerprints,
  diffFactFingerprints,
  findStaleRefs,
  fingerprint,
  itemRef,
} from "../domain";

import {
  sampleContemporary,
  sampleContext,
  sampleFantasy,
  sampleLibrary,
  sampleMinimal,
} from "./fixtures/sample-characters";

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

describe("traceability v2 (Q10)", () => {
  const withFantasy = (patch: Partial<CharacterFacts>): CharacterFacts => ({
    ...sampleFantasy,
    ...patch,
  });

  it("returns to the original fingerprint after an edit is reverted", () => {
    const original = computeFactFingerprints(sampleContemporary);
    const edited = computeFactFingerprints(
      withValues({ "identity.nationality": { state: "specified", value: "Pháp" } }),
    );
    expect(edited["identity.nationality"]).not.toBe(original["identity.nationality"]);
    const reverted = computeFactFingerprints(
      withValues({ "identity.nationality": { state: "specified", value: "Việt Nam" } }),
    );
    expect(reverted).toEqual(original);
  });

  it("detects every state transition", () => {
    const key = "appearance.piercings";
    const states = {
      unspecified: undefined,
      explicit_none: { state: "explicit_none" as const },
      not_applicable: { state: "not_applicable" as const },
      specified: { state: "specified" as const, value: [{ id: "p1", location: "Tai trái" }] },
    };
    const prints = Object.entries(states).map(([, fact]) => {
      const values = { ...sampleMinimal.values };
      if (fact) values[key] = fact;
      return computeFactFingerprints({ ...sampleMinimal, values })[key];
    });
    expect(prints[0]).toBeUndefined();
    expect(new Set(prints.slice(1)).size).toBe(3);
  });

  it("changes when a custom field's meaning changes, not when it is regrouped or re-flagged", () => {
    const base = computeFactFingerprints(sampleFantasy);
    const relabel = (patch: Record<string, unknown>) =>
      computeFactFingerprints(
        withFantasy({
          custom: {
            ...sampleFantasy.custom!,
            fields: sampleFantasy.custom!.fields.map((field) =>
              field.key === "custom.wing_pattern"
                ? ({ ...field, ...patch } as typeof field)
                : field,
            ),
          },
        }),
      );
    expect(relabel({ label: "Vết bớt trên cánh" })["custom.wing_pattern"]).not.toBe(
      base["custom.wing_pattern"],
    );
    expect(relabel({ group: "appearance.marks" })["custom.wing_pattern"]).toBe(
      base["custom.wing_pattern"],
    );
    expect(relabel({ sensitivity: "sensitive" })["custom.wing_pattern"]).toBe(
      base["custom.wing_pattern"],
    );
  });

  it("ignores library version bumps that do not change meaning", () => {
    const base = computeFactFingerprints(sampleContemporary, sampleContext);
    const bumped = {
      library: {
        ...sampleLibrary,
        fields: sampleLibrary.fields.map((field) => ({ ...field, version: field.version + 1 })),
      },
    };
    expect(computeFactFingerprints(sampleContemporary, bumped)).toEqual(base);
  });

  it("keeps built-in fingerprints independent of labels and definitions", () => {
    expect(computeFactFingerprints(sampleContemporary)["identity.age"]).toBe(
      fingerprint(sampleContemporary.values["identity.age"]),
    );
  });
});

describe("fact snapshots", () => {
  const current = computeFactFingerprints(sampleContemporary);
  const scope = ["displayName", "appearance.height", "appearance.eye_color", LIKES];
  const snapshot = createFactSnapshot(current, scope);

  it("records only facts in scope, including items of scoped lists", () => {
    expect(Object.keys(snapshot.fingerprints).sort()).toEqual(
      [
        "displayName",
        "appearance.height",
        LIKES,
        itemRef(LIKES, "like_mua"),
        itemRef(LIKES, "like_ca_phe"),
      ].sort(),
    );
    expect(assessFactSnapshot(snapshot, current)).toEqual({ status: "fresh" });
  });

  it("flags facts added to the scope later", () => {
    const later = computeFactFingerprints(
      withValues({ "appearance.eye_color": { state: "specified", value: "Nâu sẫm" } }),
    );
    expect(assessFactSnapshot(snapshot, later)).toEqual({
      status: "outdated",
      added: ["appearance.eye_color"],
      changed: [],
      removed: [],
    });
  });

  it("ignores changes outside the scope", () => {
    const later = computeFactFingerprints(
      withValues({ "identity.nationality": { state: "not_applicable" } }),
    );
    expect(assessFactSnapshot(snapshot, later)).toEqual({ status: "fresh" });
  });

  it("never compares fingerprints from another algorithm", () => {
    const legacy = { ...snapshot, algorithm: "sha256" };
    expect(assessFactSnapshot(legacy, current)).toEqual({
      status: "incomparable",
      snapshotAlgorithm: "sha256",
    });
    expect(fingerprintAlgorithm(current["identity.age"]!)).toBe(FINGERPRINT_ALGORITHM);
    // findStaleRefs is conservative: a foreign-algorithm fingerprint counts as stale.
    expect(findStaleRefs({ "identity.age": "sha256:abc" }, current)).toEqual(["identity.age"]);
  });
});
