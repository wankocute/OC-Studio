import "server-only";

import type { FactSources } from "@/features/profiles/fact-sources";
import { freshnessOf } from "@/features/profiles/fact-sources";
import type {
  ApprovedView,
  ProfileStructureView,
  ProfileView,
  RevisionSummaryView,
} from "@/features/profiles/view";

import type {
  ApprovedContent,
  ProfileRecord,
  ProfileStructure,
  RevisionSummary,
} from "./profile-repository";

export function toApprovedView(approved: ApprovedContent, sources: FactSources): ApprovedView {
  return {
    revisionId: approved.revisionId,
    content: approved.content,
    hash: approved.hash,
    approvedAt: approved.approvedAt.toISOString(),
    facts: approved.factSnapshot
      ? freshnessOf(approved.factSnapshot, sources)
      : { status: "incomparable" },
  };
}

export function toProfileView(profile: ProfileRecord, sources: FactSources): ProfileView {
  return {
    id: profile.id,
    characterId: profile.characterId,
    revision: profile.revision,
    sections: profile.sections.map((section) => ({
      id: section.id,
      key: section.key,
      title: section.title,
      isHidden: section.isHidden,
      sourceGroups: section.sourceGroups,
      draft: section.draft,
      draftRevision: section.draftRevision,
      draftUpdatedAt: section.draftUpdatedAt?.toISOString() ?? null,
      approved: section.approved ? toApprovedView(section.approved, sources) : null,
    })),
  };
}

export function toStructureView(structure: ProfileStructure): ProfileStructureView {
  return {
    revision: structure.revision,
    sections: structure.sections.map(({ id, key, title, isHidden, sourceGroups }) => ({
      id,
      key,
      title,
      isHidden,
      sourceGroups,
    })),
  };
}

export function toRevisionSummaryView(revision: RevisionSummary): RevisionSummaryView {
  return {
    id: revision.id,
    kind: revision.kind,
    createdAt: revision.createdAt.toISOString(),
    hash: revision.hash,
    excerpt: revision.excerpt,
    textLength: revision.textLength,
  };
}
