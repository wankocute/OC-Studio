import type {
  RichTextBlock,
  RichTextDocument,
  RichTextInline,
  RichTextListItem,
} from "@/features/profiles/domain";

/**
 * Typewriter support for rich text: the document is revealed by characters while its structure
 * (paragraphs, headings, lists, marks, line breaks) stays exactly as generated. Pure functions —
 * the full document is never changed, only a prefix of it is rendered.
 */

type Node = RichTextBlock | RichTextListItem;

/** Code points, so a surrogate pair (emoji) is never cut in half. */
const length = (text: string) => Array.from(text).length;

function inlineLength(inline: RichTextInline) {
  return inline.type === "text" ? length(inline.text) : 1;
}

function nodeLength(node: Node): number {
  if (node.type === "paragraph" || node.type === "heading")
    return (node.content ?? []).reduce((sum, inline) => sum + inlineLength(inline), 0);
  return (node.content as Node[]).reduce((sum, child) => sum + nodeLength(child), 0);
}

export function typedLength(document: RichTextDocument): number {
  return document.content.reduce((sum, block) => sum + nodeLength(block), 0);
}

function sliceInlines(inlines: readonly RichTextInline[], budget: number) {
  const out: RichTextInline[] = [];
  for (const inline of inlines) {
    if (budget <= 0) break;
    const size = inlineLength(inline);
    if (inline.type === "text" && size > budget)
      out.push({ ...inline, text: Array.from(inline.text).slice(0, budget).join("") });
    else out.push(inline);
    budget -= size;
  }
  return out;
}

/** The node cut to `budget` characters; `null` when nothing of it is visible yet. */
function sliceNode<T extends Node>(node: T, budget: number): T | null {
  if (node.type === "paragraph" || node.type === "heading") {
    // An empty paragraph is a blank line: it appears once the text before it is done.
    if (!node.content?.length) return budget >= 0 ? node : null;
    return budget > 0 ? { ...node, content: sliceInlines(node.content, budget) } : null;
  }
  const children: Node[] = [];
  for (const child of node.content as Node[]) {
    const sliced = sliceNode(child, budget);
    if (!sliced) break;
    children.push(sliced);
    budget -= nodeLength(child);
  }
  return children.length ? ({ ...node, content: children } as T) : null;
}

/** The first `count` characters of the document, with every block it reaches. */
export function sliceDocument(document: RichTextDocument, count: number): RichTextDocument {
  const content: RichTextBlock[] = [];
  let budget = count;
  for (const block of document.content) {
    const sliced = sliceNode(block, budget);
    if (!sliced) break;
    content.push(sliced);
    budget -= nodeLength(block);
  }
  return { type: "doc", content };
}

/*
 * Results that finished while the page was open and have not been shown yet. Only those are
 * typed out: reopening the dialog, switching tabs or loading the page with an older suggestion
 * shows it at once. Client memory only — it is a presentation hint, never data.
 */
const pending = new Set<string>();

export function markForTyping(jobId: string) {
  pending.add(jobId);
}
export function shouldType(jobId: string) {
  return pending.has(jobId);
}
export function markTyped(jobId: string) {
  pending.delete(jobId);
}
