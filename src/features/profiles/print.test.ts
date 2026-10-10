import { describe, expect, it } from "vitest";

import { emptyDocument, type RichTextDocument } from "./domain";
import { planPrint, type PrintableSection } from "./print";

const doc = (text: string): RichTextDocument => ({
  type: "doc",
  content: [{ type: "paragraph", content: [{ type: "text", text }] }],
});

const section = (
  id: string,
  key: string,
  draft: RichTextDocument | null,
  approved: RichTextDocument | null,
  extra: Partial<PrintableSection> = {},
): PrintableSection => ({
  id,
  key,
  title: null,
  isHidden: false,
  draft,
  approved: approved ? { content: approved } : null,
  ...extra,
});

const sections: PrintableSection[] = [
  section("1", "intro", doc("Giới thiệu đã duyệt"), doc("Giới thiệu đã duyệt")),
  section("2", "appearance", doc("Ngoại hình bản nháp mới"), doc("Ngoại hình đã duyệt")),
  section("3", "personality", doc("Tính cách chưa duyệt"), null),
  section("4", "psychology", null, null),
  section("5", "behavior", emptyDocument(), null),
  section("6", "background", doc("Ẩn"), doc("Ẩn đã duyệt"), { isHidden: true }),
  section("7", "ps_abcdef12", doc("Phép băng"), doc("Phép băng"), { title: "Phép thuật" }),
];

describe("planPrint", () => {
  it("prints approved content only, never filling in drafts", () => {
    const plan = planPrint(sections, "approved");
    expect(plan.sections.map((item) => [item.title, item.content])).toEqual([
      ["Giới thiệu", doc("Giới thiệu đã duyệt")],
      ["Ngoại hình", doc("Ngoại hình đã duyệt")],
      ["Phép thuật", doc("Phép băng")],
    ]);
    // Personality has a draft but no approved version: skipped and counted.
    expect(plan.unapproved).toBe(1);
    expect(plan.newerDraft).toBe(1);
  });

  it("prints saved drafts in order, skipping hidden and empty sections", () => {
    const plan = planPrint(sections, "draft");
    expect(plan.sections.map((item) => item.title)).toEqual([
      "Giới thiệu",
      "Ngoại hình",
      "Tính cách",
      "Phép thuật",
    ]);
    expect(plan.sections[1]!.content).toEqual(doc("Ngoại hình bản nháp mới"));
    expect(plan).toMatchObject({ unapproved: 0, newerDraft: 0 });
  });

  it("does not count hidden or empty sections as unapproved", () => {
    const plan = planPrint(
      [
        section("1", "intro", doc("x"), null, { isHidden: true }),
        section("2", "appearance", emptyDocument(), null),
      ],
      "approved",
    );
    expect(plan).toMatchObject({ sections: [], unapproved: 0 });
  });
});
