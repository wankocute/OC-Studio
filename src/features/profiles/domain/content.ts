/**
 * Profile content: a restricted Tiptap (ProseMirror) JSON document.
 *
 * The schema accepts exactly what the profile editor can produce — paragraphs, headings (levels
 * 2–3), bullet/numbered lists, blockquotes, hard breaks and bold/italic/underline — and rejects
 * anything else (images, links, raw HTML, unknown attributes). Like the fact schemas it never
 * transforms data: stored JSON is either valid as-is or rejected.
 */
import { z } from "zod";

import { canonicalJson, fingerprint } from "@/features/characters/domain/fingerprint";

export const CONTENT_LIMITS = {
  /** Visible characters of one section. */
  textLength: 100_000,
  /** Serialized JSON size of one section (markup overhead included). */
  jsonLength: 1_000_000,
  /** Nesting depth of blocks (lists inside lists inside quotes…). */
  depth: 12,
} as const;

export const HEADING_LEVELS = [2, 3] as const;

export type RichTextMark = { type: "bold" | "italic" | "underline" };

export type RichTextInline =
  | { type: "text"; text: string; marks?: RichTextMark[] }
  | { type: "hardBreak"; marks?: RichTextMark[] };

export type RichTextListItem = { type: "listItem"; content: RichTextBlock[] };

export type RichTextBlock =
  | { type: "paragraph"; content?: RichTextInline[] }
  | { type: "heading"; attrs: { level: 2 | 3 }; content?: RichTextInline[] }
  | { type: "blockquote"; content: RichTextBlock[] }
  | { type: "bulletList"; content: RichTextListItem[] }
  | {
      type: "orderedList";
      attrs?: { start?: number; type?: string | null };
      content: RichTextListItem[];
    };

export type RichTextDocument = { type: "doc"; content: RichTextBlock[] };

const markSchema = z.strictObject({ type: z.enum(["bold", "italic", "underline"]) });
const marksSchema = z.array(markSchema).max(3).optional();

const inlineSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("text"), text: z.string().min(1), marks: marksSchema }),
  z.strictObject({ type: z.literal("hardBreak"), marks: marksSchema }),
]);
const inlineContent = z.array(inlineSchema).optional();

const blockSchema: z.ZodType<RichTextBlock> = z.lazy(() =>
  z.discriminatedUnion("type", [
    z.strictObject({ type: z.literal("paragraph"), content: inlineContent }),
    z.strictObject({
      type: z.literal("heading"),
      attrs: z.strictObject({ level: z.union([z.literal(2), z.literal(3)]) }),
      content: inlineContent,
    }),
    z.strictObject({ type: z.literal("blockquote"), content: z.array(blockSchema).min(1) }),
    z.strictObject({ type: z.literal("bulletList"), content: z.array(listItemSchema).min(1) }),
    z.strictObject({
      type: z.literal("orderedList"),
      attrs: z
        .strictObject({
          start: z.int().min(0).max(100_000).optional(),
          type: z.string().max(10).nullable().optional(),
        })
        .optional(),
      content: z.array(listItemSchema).min(1),
    }),
  ]),
);

const listItemSchema: z.ZodType<RichTextListItem> = z.lazy(() =>
  z.strictObject({ type: z.literal("listItem"), content: z.array(blockSchema).min(1) }),
);

const MESSAGES = {
  tooLong: `Nội dung quá dài (tối đa ${CONTENT_LIMITS.textLength.toLocaleString("vi-VN")} ký tự).`,
  tooLarge: "Nội dung quá lớn để lưu.",
  tooDeep: "Nội dung lồng quá nhiều cấp.",
} as const;

function blockDepth(block: RichTextBlock | RichTextListItem): number {
  if (block.type === "paragraph" || block.type === "heading") return 1;
  const children: (RichTextBlock | RichTextListItem)[] = block.content;
  return 1 + Math.max(0, ...children.map(blockDepth));
}

export const richTextDocumentSchema: z.ZodType<RichTextDocument> = z
  .strictObject({ type: z.literal("doc"), content: z.array(blockSchema).min(1) })
  .superRefine((doc, ctx) => {
    if (documentText(doc).length > CONTENT_LIMITS.textLength) {
      ctx.addIssue({ code: "custom", message: MESSAGES.tooLong });
    }
    if (JSON.stringify(doc).length > CONTENT_LIMITS.jsonLength) {
      ctx.addIssue({ code: "custom", message: MESSAGES.tooLarge });
    }
    if (Math.max(...doc.content.map(blockDepth)) > CONTENT_LIMITS.depth) {
      ctx.addIssue({ code: "custom", message: MESSAGES.tooDeep });
    }
  });

export function parseRichTextDocument(input: unknown) {
  return richTextDocumentSchema.safeParse(input);
}

export function emptyDocument(): RichTextDocument {
  return { type: "doc", content: [{ type: "paragraph" }] };
}

function blockText(block: RichTextBlock | RichTextListItem): string {
  switch (block.type) {
    case "paragraph":
    case "heading":
      return (block.content ?? [])
        .map((inline) => (inline.type === "text" ? inline.text : "\n"))
        .join("");
    default:
      return (block.content as (RichTextBlock | RichTextListItem)[]).map(blockText).join("\n");
  }
}

/** Plain text, one line per block — for counts, excerpts and emptiness checks. */
export function documentText(doc: RichTextDocument): string {
  return doc.content.map(blockText).join("\n");
}

/** True when the document has no visible text (only empty paragraphs/lists). */
export function isDocumentEmpty(doc: RichTextDocument | null | undefined): boolean {
  return !doc || documentText(doc).trim() === "";
}

/** Short single-line excerpt for history lists. */
export function documentExcerpt(doc: RichTextDocument, length = 140): string {
  const text = documentText(doc).replace(/\s+/g, " ").trim();
  return text.length > length ? `${text.slice(0, length - 1)}…` : text;
}

/**
 * Change-detection hash of a document (canonical JSON, NFC strings) — decides whether a new
 * draft, approval or history entry would actually differ from what is stored.
 */
export function contentHash(doc: RichTextDocument): string {
  return fingerprint(doc);
}

export function sameContent(a: RichTextDocument | null, b: RichTextDocument | null): boolean {
  if (a === null || b === null) return a === b;
  return canonicalJson(a) === canonicalJson(b);
}
