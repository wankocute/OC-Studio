import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  boolean,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

// Relative imports: drizzle-kit loads this file outside Next.js and does not resolve "@/".
import { PROFILE_LIMITS, REVISION_KINDS } from "../../features/profiles/domain/constants";

import { characters } from "./characters";

const raw = (value: number) => sql.raw(String(value));
const list = (values: readonly string[]) => sql.raw(values.map((value) => `'${value}'`).join(", "));

/**
 * A character's profile: prose sections written from its facts. One primary profile per
 * character for now (partial unique index); the table already allows more later.
 * `revision` guards the section *structure* (add, rename, reorder, hide, sources); section
 * content has its own `draft_revision`, so editing one section never conflicts with another.
 */
export const profiles = pgTable(
  "profiles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    characterId: uuid("character_id")
      .notNull()
      .references(() => characters.id, { onDelete: "cascade" }),
    isPrimary: boolean("is_primary").notNull().default(true),
    revision: integer("revision").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("profiles_revision_positive", sql`${t.revision} >= 1`),
    uniqueIndex("profiles_one_primary_idx")
      .on(t.characterId)
      .where(sql`${t.isPrimary}`),
    index("profiles_character_idx").on(t.characterId),
  ],
);

/**
 * One section of a profile. The draft lives here (`draft_content`, guarded by `draft_revision`);
 * the approved version is an immutable row of `content_revisions`, referenced by
 * `approved_revision_id` — editing the draft can never change it.
 */
export const profileSections = pgTable(
  "profile_sections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    profileId: uuid("profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    /** Permanent id: built-in template key (`appearance`…) or `ps_<random>`. */
    key: text("key").notNull(),
    /** User title; NULL = the built-in section's default label. */
    title: text("title"),
    position: integer("position").notNull(),
    isHidden: boolean("is_hidden").notNull().default(false),
    /** Fact group ids this section is written from (top-level groups). */
    sourceGroups: text("source_groups")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    /** Tiptap JSON; NULL until the first save. Validated by the repository. */
    draftContent: jsonb("draft_content").$type<Record<string, unknown>>(),
    draftRevision: integer("draft_revision").notNull().default(1),
    draftUpdatedAt: timestamp("draft_updated_at", { withTimezone: true }),
    approvedRevisionId: uuid("approved_revision_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("profile_sections_profile_key_unique").on(t.profileId, t.key),
    check("profile_sections_key_format", sql`${t.key} ~ '^(ps_[a-z0-9]{6,40}|[a-z][a-z_]{1,39})$'`),
    check(
      "profile_sections_title_valid",
      sql`${t.title} is null or (btrim(${t.title}) = ${t.title} and ${t.title} <> '' and char_length(${t.title}) <= ${raw(PROFILE_LIMITS.sectionTitle)})`,
    ),
    check("profile_sections_position_valid", sql`${t.position} >= 0`),
    check("profile_sections_draft_revision_positive", sql`${t.draftRevision} >= 1`),
    check(
      "profile_sections_draft_is_doc",
      sql`${t.draftContent} is null or (jsonb_typeof(${t.draftContent}) = 'object' and ${t.draftContent} ->> 'type' = 'doc')`,
    ),
    check(
      "profile_sections_source_groups_limit",
      sql`cardinality(${t.sourceGroups}) <= ${raw(PROFILE_LIMITS.sourceGroups)}`,
    ),
    // The approved revision must belong to this section (composite FK on (id, section_id)).
    // NO ACTION (checked at the end of the statement) so deleting a whole profile can cascade.
    foreignKey({
      name: "profile_sections_approved_revision_fk",
      columns: [t.approvedRevisionId, t.id],
      foreignColumns: [contentRevisions.id, contentRevisions.sectionId],
    }).onDelete("no action"),
  ],
);

/**
 * Immutable history of section content, recorded at milestones (see `REVISION_KINDS`), never per
 * keystroke. `fact_snapshot` holds only fingerprints of the source facts (no fact values), so it
 * can tell when approved content became outdated without becoming a second copy of the facts.
 */
export const contentRevisions = pgTable(
  "content_revisions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sectionId: uuid("section_id")
      .notNull()
      .references((): AnyPgColumn => profileSections.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    content: jsonb("content").$type<Record<string, unknown>>().notNull(),
    /** `contentHash(content)` — avoids recording the same content twice in a row. */
    contentHash: text("content_hash").notNull(),
    /** For `restore`: the revision that was restored. */
    restoredFromId: uuid("restored_from_id").references((): AnyPgColumn => contentRevisions.id),
    /** `FactSnapshot` (scope + fingerprints) of the section's source facts, for approvals. */
    factSnapshot: jsonb("fact_snapshot").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("content_revisions_id_section_unique").on(t.id, t.sectionId),
    check("content_revisions_kind_valid", sql`${t.kind} in (${list(REVISION_KINDS)})`),
    check(
      "content_revisions_content_is_doc",
      sql`jsonb_typeof(${t.content}) = 'object' and ${t.content} ->> 'type' = 'doc'`,
    ),
    check("content_revisions_hash_present", sql`${t.contentHash} <> ''`),
    check(
      "content_revisions_snapshot_shape",
      sql`${t.factSnapshot} is null or jsonb_typeof(${t.factSnapshot}) = 'object'`,
    ),
    index("content_revisions_section_created_idx").on(t.sectionId, t.createdAt.desc()),
  ],
);
