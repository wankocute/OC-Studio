/**
 * Profile constants. No imports: the Drizzle schema (loaded by drizzle-kit outside Next.js) uses
 * these for CHECK constraints.
 */

export const PROFILE_LIMITS = {
  sections: 50,
  sectionTitle: 120,
  sourceGroups: 40,
} as const;

/**
 * Built-in sections a new profile starts with, in order. Keys are permanent technical ids
 * (labels live in `src/i18n`); the default source groups are only a starting point and can be
 * changed per section.
 */
export const DEFAULT_PROFILE_TEMPLATE = {
  key: "default",
  sections: [
    { key: "intro", sourceGroups: ["identity"] },
    { key: "appearance", sourceGroups: ["appearance"] },
    { key: "personality", sourceGroups: ["personality"] },
    { key: "psychology", sourceGroups: ["psychology"] },
    { key: "behavior", sourceGroups: ["behavior"] },
    { key: "background", sourceGroups: ["background"] },
    { key: "lifestyle", sourceGroups: ["lifestyle"] },
    { key: "biography", sourceGroups: ["history"] },
    { key: "relationships", sourceGroups: ["relationships"] },
  ],
} as const;

export type BuiltinSectionKey = (typeof DEFAULT_PROFILE_TEMPLATE.sections)[number]["key"];

/** Prefix of user-created section keys; the rest is random, never derived from the title. */
export const CUSTOM_SECTION_PREFIX = "ps_";

/**
 * Why a content revision exists. Revisions are taken at milestones, never per keystroke:
 * - `autosave`       — the stored draft, once an editing pause of `CHECKPOINT_INTERVAL_MS` ended;
 * - `approval`       — content approved as the official version (carries a fact snapshot);
 * - `before_restore` — the draft that a restore replaced;
 * - `restore`        — the draft after restoring an older revision;
 * - `conflict`       — the newer draft another tab saved, replaced by "keep mine".
 */
export const REVISION_KINDS = [
  "autosave",
  "approval",
  "before_restore",
  "restore",
  "conflict",
] as const;
export type RevisionKind = (typeof REVISION_KINDS)[number];

/** A draft save after this much quiet time first records the previous draft in the history. */
export const CHECKPOINT_INTERVAL_MS = 15 * 60 * 1000;
