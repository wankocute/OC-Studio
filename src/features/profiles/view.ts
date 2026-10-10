/**
 * Serializable shapes sent to the profile workspace (dates as ISO strings). Built on the server
 * from repository records; safe to import from Client Components.
 */
import { messages } from "@/i18n";

import { type FactFreshness } from "./fact-sources";
import { isBuiltinSectionKey, type RevisionKind, type RichTextDocument } from "./domain";

export type ApprovedView = {
  revisionId: string;
  content: RichTextDocument;
  hash: string;
  approvedAt: string;
  facts: FactFreshness;
};

export type SectionStructureView = {
  id: string;
  key: string;
  title: string | null;
  isHidden: boolean;
  sourceGroups: string[];
};

export type SectionView = SectionStructureView & {
  draft: RichTextDocument | null;
  draftRevision: number;
  draftUpdatedAt: string | null;
  approved: ApprovedView | null;
};

export type ProfileView = {
  id: string;
  characterId: string;
  revision: number;
  sections: SectionView[];
};

export type ProfileStructureView = {
  revision: number;
  sections: SectionStructureView[];
};

export type RevisionSummaryView = {
  id: string;
  kind: RevisionKind;
  createdAt: string;
  hash: string;
  excerpt: string;
  textLength: number;
};

/** Title shown for a section: the user's title, else the built-in default label. */
export function sectionLabel(section: Pick<SectionStructureView, "key" | "title">): string {
  if (section.title) return section.title;
  return isBuiltinSectionKey(section.key)
    ? messages.profiles.sectionLabels[section.key]
    : section.key;
}

export function defaultSectionLabel(key: string): string | undefined {
  return isBuiltinSectionKey(key) ? messages.profiles.sectionLabels[key] : undefined;
}
