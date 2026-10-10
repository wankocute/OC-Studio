import { describe, expect, it } from "vitest";

import { sampleMinimal } from "@/features/characters/__tests__/fixtures/sample-characters";
import type { CharacterFacts } from "@/features/characters/domain";
import { connectTestDatabase } from "@/test/integration-context";

import { createCharacterRepository } from "./character-repository";
import {
  countLibraryFieldUsage,
  listCharacterNames,
  listRelationshipSourcesTo,
} from "./editor-queries";
import { createLibraryDefinitionRepository } from "./library-definition-repository";

const { db } = connectTestDatabase();
const characters = createCharacterRepository(db);
const definitions = createLibraryDefinitionRepository(db);

const create = (displayName: string, values: CharacterFacts["values"] = {}) =>
  characters.create({ ...sampleMinimal, displayName, values });

const relationshipTo = (characterId: string): CharacterFacts["values"] => ({
  "relationships.entries": {
    state: "specified",
    value: [{ id: "rel_1", person: { type: "character", characterId } }],
  },
});

describe("editor queries", () => {
  it("lists active character names only", async () => {
    const a = await create("Bích");
    const b = await create("An");
    await characters.softDelete(b.id, b.revision);
    expect(await listCharacterNames(db)).toEqual([{ id: a.id, displayName: "Bích" }]);
  });

  it("finds characters whose relationships point back (not other references)", async () => {
    const target = await create("Đích");
    const friend = await create("Bạn", relationshipTo(target.id));
    await create("Sự kiện", {
      "history.events": {
        state: "specified",
        value: [
          {
            id: "evt_1",
            title: "Gặp gỡ",
            involved: [{ id: "inv_1", ref: { type: "character", characterId: target.id } }],
          },
        ],
      },
    });
    const gone = await create("Đã xóa", relationshipTo(target.id));
    await characters.softDelete(gone.id, gone.revision);

    expect(await listRelationshipSourcesTo(db, target.id)).toEqual([friend.id]);
  });

  it("counts library field usage on active characters", async () => {
    await definitions.createField({
      key: "lib.zodiac_test",
      kind: "short_text",
      group: "identity",
      label: "Cung",
    });
    await definitions.createField({
      key: "lib.unused_test",
      kind: "short_text",
      group: "identity",
      label: "Chưa dùng",
    });
    await create("Một", { "lib.zodiac_test": { state: "specified", value: "Kim Ngưu" } });
    const deleted = await create("Hai", { "lib.zodiac_test": { state: "not_applicable" } });
    await characters.softDelete(deleted.id, deleted.revision);

    expect(await countLibraryFieldUsage(db)).toEqual({
      "lib.zodiac_test": 1,
      "lib.unused_test": 0,
    });
  });

  it("stores a full editor sheet and keeps sensitivity metadata through updates", async () => {
    const created = await create("Vân");
    const facts: CharacterFacts = {
      ...created.facts,
      sourceLanguage: "pt-BR",
      values: {
        "identity.family_name": { state: "explicit_none" },
        "identity.age": { state: "specified", value: { value: 0, unit: "years" } },
        "appearance.special_features": {
          state: "specified",
          value: [
            { id: "f_2", name: "Vảy bạc" },
            { id: "f_1", name: "Đôi cánh" },
          ],
          sensitiveItemIds: ["f_2"],
        },
      },
      custom: {
        groups: [{ id: "cg_world001", label: "Thế giới" }],
        fields: [
          { key: "custom.home0001", kind: "short_text", group: "cg_world001", label: "Quê" },
        ],
      },
    };
    const saved = await characters.update(created.id, facts, created.revision);
    expect((await characters.getById(created.id)).facts).toEqual(facts);
    await expect(characters.update(created.id, facts, created.revision)).rejects.toMatchObject({
      code: "revision_conflict",
    });
    expect(saved.revision).toBe(created.revision + 1);
  });
});
