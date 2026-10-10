import { describe, expect, it } from "vitest";

import {
  type CharacterFacts,
  collectLinkedReferences,
  detachDeletedCharacter,
  parseCharacterFacts,
  suggestReverseRelationships,
} from "../domain";

import {
  SAMPLE_CHARACTER_IDS,
  sampleContemporary,
  sampleContext,
  sampleMinimal,
} from "./fixtures/sample-characters";

const KHAI = SAMPLE_CHARACTER_IDS.minimal;
const AT = "2026-10-10T09:00:00Z";

describe("collectLinkedReferences", () => {
  it("finds linked refs in relationships and nested history events, not unlinked ones", () => {
    expect(collectLinkedReferences(sampleContemporary, sampleContext)).toEqual([
      { characterId: KHAI, at: "history.events[evt_len_da_lat]" },
      { characterId: KHAI, at: "relationships.entries[rel_khai]" },
    ]);
  });
});

describe("detachDeletedCharacter (Q5)", () => {
  const result = detachDeletedCharacter(
    sampleContemporary,
    { characterId: KHAI, displayName: "Khải" },
    AT,
    sampleContext,
  );

  it("turns every linked reference into an unlinked one with a detach record", () => {
    expect(result.detached).toHaveLength(2);
    expect(collectLinkedReferences(result.facts, sampleContext)).toEqual([]);
    const relationships = result.facts.values["relationships.entries"];
    if (relationships?.state !== "specified") throw new Error("fixture changed");
    expect((relationships.value as { id: string }[])[0]).toEqual({
      id: "rel_khai",
      person: {
        type: "unlinked",
        name: "Khải",
        detachedFrom: { characterId: KHAI, reason: "character_deleted", at: AT },
      },
      type: { option: "friend" },
      description: "Bạn thân từ thời đại học.",
    });
  });

  it("keeps the result valid and leaves other references untouched", () => {
    expect(parseCharacterFacts(result.facts, sampleContext).success).toBe(true);
    const before = sampleContemporary.values["relationships.entries"];
    const after = result.facts.values["relationships.entries"];
    if (before?.state !== "specified" || after?.state !== "specified")
      throw new Error("fixture changed");
    expect((after.value as unknown[]).slice(1)).toEqual((before.value as unknown[]).slice(1));
  });

  it("does not mutate the input and is a no-op for unreferenced characters", () => {
    expect(collectLinkedReferences(sampleContemporary, sampleContext)).toHaveLength(2);
    const untouched = detachDeletedCharacter(
      sampleContemporary,
      { characterId: SAMPLE_CHARACTER_IDS.fantasy, displayName: "Dạ Vân" },
      AT,
      sampleContext,
    );
    expect(untouched.detached).toEqual([]);
    expect(untouched.facts).toBe(sampleContemporary);
  });

  it("keeps privacy metadata of the rewritten facts", () => {
    const relationships = result.facts.values["relationships.entries"];
    expect(relationships?.state === "specified" && relationships.sensitiveItemIds).toEqual([
      "rel_me",
    ]);
    const events = result.facts.values["history.events"];
    expect(events?.state === "specified" && events.sensitiveItemIds).toEqual(["evt_bo_roi_di"]);
  });

  it("never re-links by name", () => {
    const again = detachDeletedCharacter(
      result.facts,
      { characterId: KHAI, displayName: "Khải" },
      AT,
      sampleContext,
    );
    expect(again.detached).toEqual([]);
  });
});

describe("suggestReverseRelationships (Q4)", () => {
  const ngoc = { characterId: SAMPLE_CHARACTER_IDS.contemporary, facts: sampleContemporary };
  const khai = { characterId: KHAI, facts: sampleMinimal };

  it("suggests a reverse relationship without type, status or description", () => {
    expect(suggestReverseRelationships(ngoc, khai)).toEqual([
      { fromCharacterId: ngoc.characterId, fromItemId: "rel_khai", toCharacterId: KHAI },
    ]);
  });

  it("does not suggest when the target already links back, whatever the type", () => {
    const khaiWithLink: CharacterFacts = {
      ...sampleMinimal,
      values: {
        ...sampleMinimal.values,
        "relationships.entries": {
          state: "specified",
          value: [
            {
              id: "rel_ngoc",
              person: { type: "character", characterId: ngoc.characterId },
              type: { option: "rival" },
            },
          ],
        },
      },
    };
    expect(suggestReverseRelationships(ngoc, { characterId: KHAI, facts: khaiWithLink })).toEqual(
      [],
    );
  });

  it("never creates anything: both sheets are unchanged", () => {
    const before = structuredClone(sampleMinimal);
    suggestReverseRelationships(ngoc, khai);
    expect(sampleMinimal).toEqual(before);
    expect(suggestReverseRelationships(khai, ngoc)).toEqual([]);
  });
});
