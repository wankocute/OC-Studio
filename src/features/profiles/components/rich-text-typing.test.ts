import { describe, expect, it } from "vitest";

import type { RichTextDocument } from "@/features/profiles/domain";

import { sliceDocument, typedLength } from "./rich-text-typing";

const doc: RichTextDocument = {
  type: "doc",
  content: [
    { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Tựa" }] },
    {
      type: "paragraph",
      content: [
        { type: "text", text: "Ab", marks: [{ type: "bold" }] },
        { type: "hardBreak" },
        { type: "text", text: "c😀d" },
      ],
    },
    { type: "paragraph" },
    {
      type: "bulletList",
      content: [
        {
          type: "listItem",
          content: [{ type: "paragraph", content: [{ type: "text", text: "x" }] }],
        },
        {
          type: "listItem",
          content: [{ type: "paragraph", content: [{ type: "text", text: "yz" }] }],
        },
      ],
    },
  ],
};

describe("rich text typing", () => {
  it("counts code points and line breaks", () => {
    expect(typedLength(doc)).toBe(3 + 2 + 1 + 3 + 1 + 2);
  });

  it("returns the full document, unchanged, at the end", () => {
    expect(sliceDocument(doc, typedLength(doc))).toEqual(doc);
    expect(sliceDocument(doc, 10_000)).toEqual(doc);
  });

  it("keeps structure and marks, and never splits an emoji", () => {
    expect(sliceDocument(doc, 5).content).toEqual([
      doc.content[0],
      { type: "paragraph", content: [{ type: "text", text: "Ab", marks: [{ type: "bold" }] }] },
    ]);
    const cut = sliceDocument(doc, 3 + 2 + 1 + 2).content[1];
    expect(cut).toEqual({
      type: "paragraph",
      content: [
        { type: "text", text: "Ab", marks: [{ type: "bold" }] },
        { type: "hardBreak" },
        { type: "text", text: "c😀" },
      ],
    });
  });

  it("reveals list items one by one", () => {
    const partial = sliceDocument(doc, typedLength(doc) - 1);
    expect(partial.content[3]).toEqual({
      type: "bulletList",
      content: [
        doc.content[3]!.type === "bulletList" ? doc.content[3]!.content[0] : null,
        {
          type: "listItem",
          content: [{ type: "paragraph", content: [{ type: "text", text: "y" }] }],
        },
      ],
    });
    expect(sliceDocument(doc, 0).content).toEqual([]);
  });
});
