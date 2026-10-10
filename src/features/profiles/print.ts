/**
 * What goes into a printed profile — one rule set for the print page and for the workspace's
 * "print" dialog, so both always agree.
 *
 * - Only visible sections, in their current order, with their current titles.
 * - `approved`: approved content only. A section without an approved version is left out (never
 *   filled in from its draft); a section whose draft changed since approval prints the approved
 *   text.
 * - `draft`: the saved draft.
 * - Empty content is left out either way.
 */
import { isDocumentEmpty, type RichTextDocument, sameContent } from "./domain";
import { sectionLabel } from "./view";

export const PRINT_SOURCES = ["approved", "draft"] as const;
export type PrintSource = (typeof PRINT_SOURCES)[number];
export const DEFAULT_PRINT_SOURCE: PrintSource = "approved";

export type PrintableSection = {
  id: string;
  key: string;
  title: string | null;
  isHidden: boolean;
  draft: RichTextDocument | null;
  approved: { content: RichTextDocument } | null;
};

export type PrintPlan = {
  source: PrintSource;
  sections: { id: string; title: string; content: RichTextDocument }[];
  /** Visible sections left out of an approved print because they were never approved. */
  unapproved: number;
  /** Approved sections whose draft has unapproved changes (the approved text is printed). */
  newerDraft: number;
};

export function planPrint(sections: readonly PrintableSection[], source: PrintSource): PrintPlan {
  const plan: PrintPlan = { source, sections: [], unapproved: 0, newerDraft: 0 };
  for (const section of sections) {
    if (section.isHidden) continue;
    const content = source === "approved" ? section.approved?.content : section.draft;
    if (source === "approved" && !section.approved && !isDocumentEmpty(section.draft)) {
      plan.unapproved += 1;
    }
    if (!content || isDocumentEmpty(content)) continue;
    if (source === "approved" && section.draft && !sameContent(section.draft, content)) {
      plan.newerDraft += 1;
    }
    plan.sections.push({ id: section.id, title: sectionLabel(section), content });
  }
  return plan;
}
