import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { buildEditorGroups, visibilityOf } from "@/features/characters/editor/layout";
import type {
  CharacterFacts,
  LibraryDefinitions,
  PresentationMode,
} from "@/features/characters/domain";
import { buildNavEntries, EditorNav, type NavEntry } from "./editor-nav";

const facts: CharacterFacts = {
  schemaVersion: 3,
  displayName: "Nav test",
  values: {},
  custom: {
    groups: [
      { id: "cg_magic01", label: "Phép thuật" },
      { id: "cg_spell01", label: "Phép đã học", parent: "cg_magic01" },
    ],
    fields: [
      { key: "custom.mana01", label: "Mana", group: "cg_magic01", kind: "short_text" },
      { key: "custom.spell01", label: "Lửa", group: "cg_spell01", kind: "short_text" },
    ],
  },
};
function entries(mode: PresentationMode) {
  const library = { groups: [], fields: [] };
  const groups = buildEditorGroups({
    custom: facts.custom,
    library,
    deprecatedLibraryKeys: new Set(),
  });
  return buildNavEntries(
    groups,
    () => 0,
    false,
    (field) =>
      visibilityOf(field, {
        mode,
        facts,
        library,
        addedLibraryKeys: [],
      }) === "visible",
  );
}
const find = (items: NavEntry[], id: string): NavEntry | undefined =>
  items.find((item) => item.id === id) ??
  items
    .flatMap((item) => item.children ?? [])
    .map((item) => find([item], id))
    .find(Boolean);

describe("editor navigation tree", () => {
  it("includes shared custom groups and their fields when library definitions are in use", () => {
    const library: LibraryDefinitions = {
      groups: [{ id: "lg_magic01", label: "Nhóm dùng chung" }],
      fields: [
        {
          version: 1,
          key: "lib.mana01",
          label: "Mana dùng chung",
          group: "lg_magic01",
          kind: "short_text" as const,
        },
      ],
    };
    const current: CharacterFacts = {
      ...facts,
      values: { "lib.mana01": { state: "specified", value: "20" } },
    };
    const groups = buildEditorGroups({
      custom: current.custom,
      library,
      deprecatedLibraryKeys: new Set(),
    });
    const nav = buildNavEntries(
      groups,
      () => 0,
      false,
      (field) =>
        visibilityOf(field, { mode: "basic", facts: current, library, addedLibraryKeys: [] }) ===
        "visible",
    );
    expect(find(nav, "lg_magic01")?.children?.[0]).toMatchObject({
      label: "Mana dùng chung",
      fieldKey: "lib.mana01",
    });
  });
  it("builds direct fields, subgroups and custom nested groups from definitions for each mode", () => {
    const basic = entries("basic");
    expect(find(basic, "identity.full_name")?.fieldKey).toBe("identity.full_name");
    expect(find(basic, "appearance.body_details")).toBeUndefined();
    expect(find(entries("advanced"), "appearance.body_details")?.sectionId).toBe("appearance.body");
    expect(find(basic, "custom.mana01")?.sectionId).toBe("cg_magic01");
    expect(find(basic, "cg_spell01")?.children?.[0].fieldKey).toBe("custom.spell01");
  });
  // Role queries over the whole built-in tree take ~2.5 s alone and far longer when the full
  // suite runs in parallel; the default 5 s was not enough even before animations were added.
  it(
    "keeps both expansion levels and marks the selected field while navigating",
    { timeout: 30_000 },
    () => {
      const onSelect = vi.fn();
      const all = entries("advanced");
      const view = render(<EditorNav entries={all} active="identity" onSelect={onSelect} />);
      const nav = within(screen.getByRole("navigation"));
      fireEvent.click(nav.getByRole("button", { name: "Mở rộng Ngoại hình" }));
      fireEvent.click(nav.getByRole("button", { name: "Mở rộng Mái tóc" }));
      fireEvent.click(nav.getByRole("button", { name: "Màu tóc" }));
      expect(onSelect).toHaveBeenLastCalledWith(
        "appearance",
        "appearance.hair",
        "appearance.hair_color",
      );
      view.rerender(
        <EditorNav
          entries={all}
          active="appearance"
          activeItem="appearance.hair_color"
          onSelect={onSelect}
        />,
      );
      expect(nav.getByRole("button", { name: "Màu tóc" })).toHaveAttribute(
        "aria-current",
        "location",
      );
      view.rerender(<EditorNav entries={all} active="psychology" onSelect={onSelect} />);
      expect(nav.getByRole("button", { name: "Thu gọn Ngoại hình" })).toHaveAttribute(
        "aria-expanded",
        "true",
      );
      expect(nav.getByRole("button", { name: "Thu gọn Mái tóc" })).toHaveAttribute(
        "aria-expanded",
        "true",
      );
    },
  );
  it("exposes the same tree on mobile and closes its menu after field selection", () => {
    const onSelect = vi.fn();
    render(<EditorNav entries={entries("basic")} active="cg_magic01" onSelect={onSelect} />);
    const menu = screen.getByRole("button", { name: /^Chuyển tới nhóm:/ });
    fireEvent.click(menu);
    expect(menu).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(screen.getByRole("button", { name: "Mở rộng Phép thuật" }));
    fireEvent.click(screen.getByRole("button", { name: "Mana" }));
    expect(onSelect).toHaveBeenLastCalledWith("cg_magic01", "cg_magic01", "custom.mana01");
    expect(menu).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(menu);
    expect(screen.getByRole("button", { name: "Thu gọn Phép thuật" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
  });
});
