import { useSyncExternalStore } from "react";

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
 * AI text that was just produced and has not been shown yet (keyed by job, or by the section
 * draft it was written into). Only those are typed out: reopening, switching tabs or reloading
 * shows text at once. Client memory only — it is a presentation hint, never data.
 */
const pending = new Set<string>();
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((listener) => listener());

export function markForTyping(key: string) {
  pending.add(key);
  notify();
}
export function shouldType(key: string) {
  return pending.has(key);
}
export function markTyped(key: string) {
  if (pending.delete(key)) notify();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}

/** Typing key of AI text written into a section's draft (that draft revision only). */
export function draftTypingKey(sectionId: string, draftRevision: number) {
  return `draft:${sectionId}:${draftRevision}`;
}

/** Whether `key` still waits for its typing animation (re-renders when that changes). */
export function useTypingPending(key: string) {
  return useSyncExternalStore(
    subscribe,
    () => pending.has(key),
    () => false,
  );
}
