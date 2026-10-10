import { Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { describe, expect, it } from "vitest";

import { createFactSnapshot, DISPLAY_NAME_REF } from "@/features/characters/domain";

import { DEFAULT_PROFILE_TEMPLATE } from "./constants";
import {
  CONTENT_LIMITS,
  contentHash,
  documentExcerpt,
  documentText,
  emptyDocument,
  isDocumentEmpty,
  parseRichTextDocument,
  type RichTextDocument,
  sameContent,
} from "./content";
import { sectionFactScope, sectionStatus, sectionTitleSchema } from "./sections";

const paragraph = (text: string) => ({
  type: "paragraph" as const,
  content: [{ type: "text" as const, text }],
});
const doc = (...texts: string[]): RichTextDocument => ({
  type: "doc",
  content: texts.map(paragraph),
});

describe("rich text content schema", () => {
  it("accepts everything the profile editor produces (same extension set)", () => {
    const editor = new Editor({
      extensions: [
        StarterKit.configure({
          code: false,
          codeBlock: false,
          horizontalRule: false,
          strike: false,
          link: false,
          heading: { levels: [2, 3] },
        }),
      ],
      content:
        "<h2>Ngoại hình</h2><h3>Tóc</h3><p><strong>Đậm</strong> <em>nghiêng</em> <u>gạch</u><br>dòng mới</p>" +
        "<ul><li><p>một</p><ul><li><p>lồng</p></li></ul></li></ul><ol start='4'><li><p>bốn</p></li></ol>" +
        "<blockquote><p>“Trích dẫn”</p></blockquote><p><s>gạch ngang</s> <code>mã</code> <a href='x'>liên kết</a></p>",
    });
    const json = editor.getJSON();
    editor.destroy();
    const result = parseRichTextDocument(json);
    expect(result.success, JSON.stringify(result.error?.issues)).toBe(true);
    // Unsupported formatting is reduced to plain text by the editor schema, not stored.
    expect(JSON.stringify(json)).not.toMatch(/strike|code|link/);
  });

  it("accepts the empty editor document", () => {
    expect(parseRichTextDocument(emptyDocument()).success).toBe(true);
    expect(isDocumentEmpty(emptyDocument())).toBe(true);
    expect(isDocumentEmpty(null)).toBe(true);
    expect(isDocumentEmpty(doc("   "))).toBe(true);
    expect(isDocumentEmpty(doc("x"))).toBe(false);
  });

  it.each([
    ["unknown node", { type: "doc", content: [{ type: "image", attrs: { src: "x" } }] }],
    ["raw html node", { type: "doc", content: [{ type: "html", text: "<script>" }] }],
    [
      "unknown mark",
      {
        type: "doc",
        content: [
          { type: "paragraph", content: [{ type: "text", text: "a", marks: [{ type: "link" }] }] },
        ],
      },
    ],
    [
      "heading level 1",
      { type: "doc", content: [{ type: "heading", attrs: { level: 1 }, content: [] }] },
    ],
    [
      "extra attribute",
      { type: "doc", content: [{ type: "paragraph", attrs: { style: "color:red" } }] },
    ],
    [
      "empty text node",
      { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "" }] }] },
    ],
    ["empty list", { type: "doc", content: [{ type: "bulletList", content: [] }] }],
    ["no blocks", { type: "doc", content: [] }],
    ["not a doc", { type: "paragraph" }],
    ["string", "<p>html</p>"],
  ])("rejects %s", (_, input) => {
    expect(parseRichTextDocument(input).success).toBe(false);
  });

  it("limits text length and nesting depth", () => {
    const long = doc("a".repeat(CONTENT_LIMITS.textLength + 1));
    expect(parseRichTextDocument(long).success).toBe(false);

    let block: RichTextDocument["content"][number] = paragraph("sâu");
    for (let level = 0; level < CONTENT_LIMITS.depth; level++) {
      block = { type: "blockquote", content: [block] };
    }
    expect(parseRichTextDocument({ type: "doc", content: [block] }).success).toBe(false);
  });

  it("keeps Vietnamese text as typed (validation never transforms)", () => {
    const input = doc("Nguyễn Thị Ánh Tuyết — “Hoa”");
    const result = parseRichTextDocument(input);
    expect(result.success && result.data).toEqual(input);
    expect(documentText(input)).toBe("Nguyễn Thị Ánh Tuyết — “Hoa”");
  });

  it("hashes content deterministically; NFC and NFD spellings are the same content", () => {
    const nfc = doc("Tiếng Việt".normalize("NFC"));
    const nfd = doc("Tiếng Việt".normalize("NFD"));
    expect(contentHash(nfc)).toBe(contentHash(nfd));
    expect(sameContent(nfc, nfd)).toBe(true);
    expect(contentHash(doc("a"))).not.toBe(contentHash(doc("b")));
    expect(sameContent(null, null)).toBe(true);
    expect(sameContent(doc("a"), null)).toBe(false);
  });

  it("builds plain text and excerpts", () => {
    const content: RichTextDocument = {
      type: "doc",
      content: [
        { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Tiêu đề" }] },
        { type: "bulletList", content: [{ type: "listItem", content: [paragraph("một")] }] },
      ],
    };
    expect(documentText(content)).toBe("Tiêu đề\nmột");
    expect(documentExcerpt(doc("x".repeat(200)), 10)).toBe(`${"x".repeat(9)}…`);
  });
});

describe("profile sections", () => {
  it("starts with the nine template sections, each linked to a fact group", () => {
    expect(DEFAULT_PROFILE_TEMPLATE.sections.map((section) => section.key)).toEqual([
      "intro",
      "appearance",
      "personality",
      "psychology",
      "behavior",
      "background",
      "lifestyle",
      "biography",
      "relationships",
    ]);
    expect(DEFAULT_PROFILE_TEMPLATE.sections.every((s) => s.sourceGroups.length > 0)).toBe(true);
  });

  it("derives draft/approved status from content, not from flags", () => {
    const approved = { hash: contentHash(doc("Bản duyệt")) };
    expect(sectionStatus(null, null)).toBe("empty");
    expect(sectionStatus(emptyDocument(), null)).toBe("empty");
    expect(sectionStatus(doc("Nháp"), null)).toBe("draft");
    expect(sectionStatus(doc("Bản duyệt"), approved)).toBe("approved");
    expect(sectionStatus(doc("Bản duyệt đã sửa"), approved)).toBe("changed");
  });

  it("scopes source facts to the display name and the fields of its groups", () => {
    const fieldsByGroup = new Map([
      ["appearance", ["appearance.height", "appearance.hair_color"]],
      ["identity", ["identity.age"]],
    ]);
    expect(sectionFactScope(["appearance", "missing"], fieldsByGroup)).toEqual([
      DISPLAY_NAME_REF,
      "appearance.height",
      "appearance.hair_color",
    ]);
    const snapshot = createFactSnapshot(
      { displayName: "c53:1", "appearance.height": "c53:2", "identity.age": "c53:3" },
      sectionFactScope(["appearance"], fieldsByGroup),
    );
    // Only fingerprints are kept — never fact values.
    expect(snapshot.fingerprints).toEqual({ displayName: "c53:1", "appearance.height": "c53:2" });
  });

  it("requires normalized, non-empty titles", () => {
    expect(sectionTitleSchema.safeParse("Phép thuật").success).toBe(true);
    expect(sectionTitleSchema.safeParse(" Phép thuật").success).toBe(false);
    expect(sectionTitleSchema.safeParse("").success).toBe(false);
    expect(sectionTitleSchema.safeParse("x".repeat(121)).success).toBe(false);
  });
});
