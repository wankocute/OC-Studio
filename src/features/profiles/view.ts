/**
 * Serializable shapes sent to the profile workspace (dates as ISO strings). Built on the server
 * from repository records; safe to import from Client Components.
 */
import { messages } from "@/i18n";

import { type FactFreshness } from "./fact-sources";
import {
  isBuiltinSectionKey,
  type RevisionKind,
  type RichTextDocument,
  sectionStatus,
} from "./domain";

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

export type ProfileProgress = {
  /** Visible sections (hidden ones are not part of the profile being shown). */
  sections: number;
  approved: number;
  /** Visible sections with a draft that is not approved yet, or differs from the approved one. */
  pending: number;
  /** Visible approved sections whose source facts changed since approval. */
  outdated: { key: string; title: string }[];
};

/** Progress of a profile, from the same status and fact-snapshot rules the workspace uses. */
export function profileProgress(profile: ProfileView): ProfileProgress {
  const progress: ProfileProgress = { sections: 0, approved: 0, pending: 0, outdated: [] };
  for (const section of profile.sections) {
    if (section.isHidden) continue;
    progress.sections += 1;
    if (section.approved) progress.approved += 1;
    const status = sectionStatus(section.draft, section.approved);
    if (status === "draft" || status === "changed") progress.pending += 1;
    if (section.approved?.facts.status === "outdated") {
      progress.outdated.push({ key: section.key, title: sectionLabel(section) });
    }
  }
  return progress;
}
