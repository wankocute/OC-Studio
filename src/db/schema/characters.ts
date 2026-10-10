import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

// Relative import: drizzle-kit loads this file outside Next.js and does not resolve "@/".
import { LIMITS } from "../../features/characters/domain/constants";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};

/**
 * One row per OC.
 *
 * `display_name` and `schema_version` are the single source of truth for those two parts of
 * `CharacterFacts`; `facts` holds the rest (`values`, `custom`, `sourceLanguage`, …) and is
 * forbidden by a CHECK from carrying its own `displayName` / `schemaVersion`.
 */
export const characters = pgTable(
  "characters",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    displayName: text("display_name").notNull(),
    /** CharacterFacts without `displayName` and `schemaVersion`. Validated by the repository. */
    facts: jsonb("facts").$type<Record<string, unknown>>().notNull(),
    schemaVersion: integer("schema_version").notNull(),
    /** Optimistic-locking counter: +1 on every change of display name or facts. */
    revision: integer("revision").notNull().default(1),
    isFavorite: boolean("is_favorite").notNull().default(false),
    ...timestamps,
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    check(
      "characters_display_name_valid",
      sql`btrim(${t.displayName}) <> '' and char_length(${t.displayName}) <= ${sql.raw(String(LIMITS.displayName))}`,
    ),
    check(
      "characters_facts_shape",
      sql`jsonb_typeof(${t.facts}) = 'object' and ${t.facts} ? 'values' and not (${t.facts} ?| array['displayName', 'schemaVersion'])`,
    ),
    check("characters_schema_version_positive", sql`${t.schemaVersion} >= 1`),
    check("characters_revision_positive", sql`${t.revision} >= 1`),
    index("characters_active_updated_at_idx")
      .on(t.updatedAt.desc())
      .where(sql`${t.deletedAt} is null`),
    index("characters_active_display_name_idx")
      .on(t.displayName)
      .where(sql`${t.deletedAt} is null`),
  ],
);

/**
 * Derived index of linked character references inside `characters.facts` — never edited
 * directly. Rebuilt for a source character in the same transaction that writes its facts.
 */
export const characterReferences = pgTable(
  "character_references",
  {
    sourceCharacterId: uuid("source_character_id")
      .notNull()
      .references(() => characters.id, { onDelete: "cascade" }),
    /** Fact ref holding the reference: `relationships.entries[rel_1]`, `custom.mentor`… */
    factRef: text("fact_ref").notNull(),
    targetCharacterId: uuid("target_character_id")
      .notNull()
      .references(() => characters.id, { onDelete: "restrict" }),
  },
  (t) => [
    primaryKey({ columns: [t.sourceCharacterId, t.factRef, t.targetCharacterId] }),
    index("character_references_target_idx").on(t.targetCharacterId),
  ],
);
