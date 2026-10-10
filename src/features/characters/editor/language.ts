/**
 * Source language picker (Q9): common BCP 47 tags plus any other well-formed tag.
 * The picker only labels the user's text; nothing is ever translated.
 */
import { canonicalLanguageTag, normalizeLanguageInput } from "@/features/characters/domain";

/** Common choices, shown first. Labels come from `Intl.DisplayNames` in the UI locale. */
export const COMMON_LANGUAGE_TAGS = ["vi", "en", "ja", "ko", "zh", "fr", "es", "de"] as const;

export const LANGUAGE_UNSET = "";
export const LANGUAGE_OTHER = "__other";

export type LanguageDraft = { choice: string; other: string };

export function languageToDraft(tag: string | undefined): LanguageDraft {
  if (tag === undefined) return { choice: LANGUAGE_UNSET, other: "" };
  if ((COMMON_LANGUAGE_TAGS as readonly string[]).includes(tag)) return { choice: tag, other: "" };
  return { choice: LANGUAGE_OTHER, other: tag };
}

/** Stored value: `undefined` = unknown; malformed tags are kept so validation reports them. */
export function draftToLanguage(draft: LanguageDraft): string | undefined {
  if (draft.choice === LANGUAGE_UNSET) return undefined;
  return normalizeLanguageInput(draft.choice === LANGUAGE_OTHER ? draft.other : draft.choice);
}

/** Human-readable name of a tag in the UI language, or `undefined` if the tag is malformed. */
export function languageName(tag: string, uiLocale = "vi"): string | undefined {
  const canonical = canonicalLanguageTag(tag);
  if (!canonical) return undefined;
  try {
    return new Intl.DisplayNames([uiLocale], { type: "language" }).of(canonical);
  } catch {
    return undefined;
  }
}
