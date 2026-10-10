/**
 * Profile sections and the built-in profile template.
 *
 * A section is prose about the character. It does not hold facts: it only names the fact groups
 * it is written from (`sourceGroups`), so traceability and staleness are computed from the one
 * fact sheet (`characters.facts`) — never from a copy.
 */
import { z } from "zod";

import {
  createFactSnapshot,
  DISPLAY_NAME_REF,
  type FactFingerprints,
  type FactSnapshot,
} from "@/features/characters/domain/fingerprint";

import { type BuiltinSectionKey, DEFAULT_PROFILE_TEMPLATE, PROFILE_LIMITS } from "./constants";
import { contentHash, isDocumentEmpty, type RichTextDocument } from "./content";

const builtinSectionKeys: ReadonlySet<string> = new Set(
  DEFAULT_PROFILE_TEMPLATE.sections.map((section) => section.key),
);

export function isBuiltinSectionKey(key: string): key is BuiltinSectionKey {
  return builtinSectionKeys.has(key);
}

export const sectionTitleSchema = z
  .string()
  .refine((title) => title === title.trim() && title.normalize("NFC") === title, {
    message: "Tên mục phải được chuẩn hóa trước khi lưu.",
  })
  .pipe(
    z
      .string()
      .min(1, "Tên mục không được để trống.")
      .max(PROFILE_LIMITS.sectionTitle, `Tên mục tối đa ${PROFILE_LIMITS.sectionTitle} ký tự.`),
  );

/** Trim and NFC-normalise user input before validating it with `sectionTitleSchema`. */
export function normalizeSectionTitle(input: string): string {
  return input.normalize("NFC").trim();
}

export const sourceGroupsSchema = z
  .array(z.string().min(1).max(200))
  .max(PROFILE_LIMITS.sourceGroups)
  .refine((groups) => new Set(groups).size === groups.length, {
    message: "Nhóm dữ kiện bị trùng.",
  });

// ---------------------------------------------------------------------------
// Draft / approved status
// ---------------------------------------------------------------------------

export type SectionStatus =
  /** Nothing written yet. */
  | "empty"
  /** A draft exists but nothing was ever approved. */
  | "draft"
  /** The draft is exactly the approved content. */
  | "approved"
  /** Approved content exists and the draft differs from it. */
  | "changed";

export function sectionStatus(
  draft: RichTextDocument | null,
  approved: { hash: string } | null,
): SectionStatus {
  if (approved === null) return isDocumentEmpty(draft) ? "empty" : "draft";
  if (draft === null) return "approved";
  return contentHash(draft) === approved.hash ? "approved" : "changed";
}

// ---------------------------------------------------------------------------
// Source facts (traceability for approval now, AI generation later)
// ---------------------------------------------------------------------------

/**
 * Field-level fact refs a section is written from: the display name plus every field in its
 * source groups (sub-groups included). `fieldsByGroup` maps a top-level group id to its field
 * keys, as built from the definitions (built-in, library and the character's own).
 */
export function sectionFactScope(
  sourceGroups: readonly string[],
  fieldsByGroup: ReadonlyMap<string, readonly string[]>,
): string[] {
  const keys = sourceGroups.flatMap((group) => fieldsByGroup.get(group) ?? []);
  return [DISPLAY_NAME_REF, ...new Set(keys)];
}

/** Fingerprints of the section's source facts at the time content is approved. */
export function sectionFactSnapshot(
  sourceGroups: readonly string[],
  fieldsByGroup: ReadonlyMap<string, readonly string[]>,
  fingerprints: FactFingerprints,
): FactSnapshot {
  return createFactSnapshot(fingerprints, sectionFactScope(sourceGroups, fieldsByGroup));
}
