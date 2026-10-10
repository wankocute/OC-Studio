import { sql } from "drizzle-orm";
import { check, integer, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

// Relative import: drizzle-kit loads this file outside Next.js and does not resolve "@/".
import { NAMESPACES } from "../../features/characters/domain/constants";

/** SQL string literal for a constant prefix (CHECK constraints cannot use bound parameters). */
const literal = (value: string) => sql.raw(`'${value.replaceAll("'", "''")}'`);

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};

export const DEFINITION_STATUSES = ["active", "deprecated"] as const;
export type DefinitionStatus = (typeof DEFINITION_STATUSES)[number];

/** Library-scoped custom groups (`lg_<id>`). */
export const libraryFieldGroups = pgTable(
  "library_field_groups",
  {
    id: text("id").primaryKey(),
    label: text("label").notNull(),
    /** Built-in or library top-level group; checked by the domain schema, not an FK. */
    parent: text("parent"),
    /** Display order. */
    position: integer("position").notNull().default(0),
    ...timestamps,
  },
  (t) => [
    check(
      "library_field_groups_id_namespace",
      sql`starts_with(${t.id}, ${literal(NAMESPACES.libraryGroup)})`,
    ),
    check("library_field_groups_label_not_blank", sql`btrim(${t.label}) <> ''`),
  ],
);

/**
 * Library-scoped field definitions (`lib.<id>`). `definition` is the `LibraryFieldDefinition`
 * without `key` and `version` (those are columns). Rows are never hard-deleted once used, and a
 * key is never reused: retiring a definition sets `status = 'deprecated'`.
 */
export const libraryFieldDefinitions = pgTable(
  "library_field_definitions",
  {
    key: text("key").primaryKey(),
    version: integer("version").notNull().default(1),
    definition: jsonb("definition").$type<Record<string, unknown>>().notNull(),
    status: text("status", { enum: DEFINITION_STATUSES }).notNull().default("active"),
    position: integer("position").notNull().default(0),
    ...timestamps,
    deprecatedAt: timestamp("deprecated_at", { withTimezone: true }),
  },
  (t) => [
    check(
      "library_field_definitions_key_namespace",
      sql`starts_with(${t.key}, ${literal(NAMESPACES.libraryField)})`,
    ),
    check("library_field_definitions_version_positive", sql`${t.version} >= 1`),
    check(
      "library_field_definitions_definition_shape",
      sql`jsonb_typeof(${t.definition}) = 'object' and not (${t.definition} ?| array['key', 'version'])`,
    ),
    check("library_field_definitions_status_valid", sql`${t.status} in ('active', 'deprecated')`),
    check(
      "library_field_definitions_deprecated_at_matches_status",
      sql`(${t.status} = 'deprecated') = (${t.deprecatedAt} is not null)`,
    ),
  ],
);
