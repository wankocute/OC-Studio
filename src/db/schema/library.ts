import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { characters } from "./characters";

export const LIBRARY_LIMITS = {
  tagName: 100,
  collectionName: 200,
  collectionDescription: 2_000,
  filename: 255,
  storageKey: 1_024,
} as const;

export const MEDIA_ROLES = ["avatar", "reference"] as const;
export type MediaRole = (typeof MEDIA_ROLES)[number];

const raw = (value: number) => sql.raw(String(value));

// ---------------------------------------------------------------------------
// Media (metadata only — binaries live in file/object storage)
// ---------------------------------------------------------------------------

/**
 * An image file in storage. `storage_key` is an opaque, backend-neutral key (e.g.
 * `media/2026/10/<uuid>.webp`); the storage adapter maps it to a path or object URL, so moving
 * from local disk to object storage changes configuration, not rows or character facts.
 */
export const mediaAssets = pgTable(
  "media_assets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    storageKey: text("storage_key").notNull(),
    originalFilename: text("original_filename"),
    mimeType: text("mime_type").notNull(),
    byteSize: bigint("byte_size", { mode: "number" }).notNull(),
    width: integer("width"),
    height: integer("height"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("media_assets_storage_key_unique").on(t.storageKey),
    check(
      "media_assets_storage_key_valid",
      sql`btrim(${t.storageKey}) <> '' and char_length(${t.storageKey}) <= ${raw(LIBRARY_LIMITS.storageKey)}`,
    ),
    check(
      "media_assets_filename_length",
      sql`${t.originalFilename} is null or char_length(${t.originalFilename}) <= ${raw(LIBRARY_LIMITS.filename)}`,
    ),
    check("media_assets_mime_is_image", sql`${t.mimeType} ~ '^image/[a-z0-9.+-]+$'`),
    check("media_assets_byte_size_positive", sql`${t.byteSize} > 0`),
    check(
      "media_assets_dimensions_valid",
      sql`(${t.width} is null and ${t.height} is null) or (${t.width} > 0 and ${t.height} > 0)`,
    ),
  ],
);

/** Which images a character uses, in what role and order. */
export const characterMedia = pgTable(
  "character_media",
  {
    characterId: uuid("character_id")
      .notNull()
      .references(() => characters.id, { onDelete: "cascade" }),
    mediaId: uuid("media_id")
      .notNull()
      .references(() => mediaAssets.id, { onDelete: "restrict" }),
    role: text("role", { enum: MEDIA_ROLES }).notNull(),
    position: integer("position").notNull().default(0),
    /** The image shown for the character (thumbnail/cover). At most one per character. */
    isPrimary: boolean("is_primary").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.characterId, t.mediaId] }),
    check("character_media_role_valid", sql`${t.role} in ('avatar', 'reference')`),
    check("character_media_position_non_negative", sql`${t.position} >= 0`),
    uniqueIndex("character_media_one_avatar")
      .on(t.characterId)
      .where(sql`${t.role} = 'avatar'`),
    uniqueIndex("character_media_one_primary")
      .on(t.characterId)
      .where(sql`${t.isPrimary}`),
    index("character_media_media_idx").on(t.mediaId),
  ],
);

// ---------------------------------------------------------------------------
// Tags and collections
// ---------------------------------------------------------------------------

export const tags = pgTable(
  "tags",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Case-insensitive uniqueness: "Fantasy" and "fantasy" are the same tag.
    uniqueIndex("tags_name_unique").on(sql`lower(${t.name})`),
    check(
      "tags_name_valid",
      sql`btrim(${t.name}) = ${t.name} and ${t.name} <> '' and char_length(${t.name}) <= ${raw(LIBRARY_LIMITS.tagName)}`,
    ),
  ],
);

export const characterTags = pgTable(
  "character_tags",
  {
    characterId: uuid("character_id")
      .notNull()
      .references(() => characters.id, { onDelete: "cascade" }),
    tagId: uuid("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.characterId, t.tagId] }),
    index("character_tags_tag_idx").on(t.tagId),
  ],
);

/** A flat group of characters (no nesting). */
export const collections = pgTable(
  "collections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    description: text("description"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("collections_name_unique").on(sql`lower(${t.name})`),
    check(
      "collections_name_valid",
      sql`btrim(${t.name}) = ${t.name} and ${t.name} <> '' and char_length(${t.name}) <= ${raw(LIBRARY_LIMITS.collectionName)}`,
    ),
    check(
      "collections_description_length",
      sql`${t.description} is null or char_length(${t.description}) <= ${raw(LIBRARY_LIMITS.collectionDescription)}`,
    ),
  ],
);

export const characterCollections = pgTable(
  "character_collections",
  {
    collectionId: uuid("collection_id")
      .notNull()
      .references(() => collections.id, { onDelete: "cascade" }),
    characterId: uuid("character_id")
      .notNull()
      .references(() => characters.id, { onDelete: "cascade" }),
    position: integer("position").notNull().default(0),
    addedAt: timestamp("added_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.collectionId, t.characterId] }),
    check("character_collections_position_non_negative", sql`${t.position} >= 0`),
    index("character_collections_character_idx").on(t.characterId),
  ],
);
