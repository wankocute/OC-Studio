CREATE TABLE "character_references" (
	"source_character_id" uuid NOT NULL,
	"fact_ref" text NOT NULL,
	"target_character_id" uuid NOT NULL,
	CONSTRAINT "character_references_source_character_id_fact_ref_target_character_id_pk" PRIMARY KEY("source_character_id","fact_ref","target_character_id")
);
--> statement-breakpoint
CREATE TABLE "characters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"display_name" text NOT NULL,
	"facts" jsonb NOT NULL,
	"schema_version" integer NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"is_favorite" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "characters_display_name_valid" CHECK (btrim("characters"."display_name") <> '' and char_length("characters"."display_name") <= 200),
	CONSTRAINT "characters_facts_shape" CHECK (jsonb_typeof("characters"."facts") = 'object' and "characters"."facts" ? 'values' and not ("characters"."facts" ?| array['displayName', 'schemaVersion'])),
	CONSTRAINT "characters_schema_version_positive" CHECK ("characters"."schema_version" >= 1),
	CONSTRAINT "characters_revision_positive" CHECK ("characters"."revision" >= 1)
);
--> statement-breakpoint
CREATE TABLE "character_collections" (
	"collection_id" uuid NOT NULL,
	"character_id" uuid NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "character_collections_collection_id_character_id_pk" PRIMARY KEY("collection_id","character_id"),
	CONSTRAINT "character_collections_position_non_negative" CHECK ("character_collections"."position" >= 0)
);
--> statement-breakpoint
CREATE TABLE "character_media" (
	"character_id" uuid NOT NULL,
	"media_id" uuid NOT NULL,
	"role" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "character_media_character_id_media_id_pk" PRIMARY KEY("character_id","media_id"),
	CONSTRAINT "character_media_role_valid" CHECK ("character_media"."role" in ('avatar', 'reference')),
	CONSTRAINT "character_media_position_non_negative" CHECK ("character_media"."position" >= 0)
);
--> statement-breakpoint
CREATE TABLE "character_tags" (
	"character_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "character_tags_character_id_tag_id_pk" PRIMARY KEY("character_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "collections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "collections_name_valid" CHECK (btrim("collections"."name") = "collections"."name" and "collections"."name" <> '' and char_length("collections"."name") <= 200),
	CONSTRAINT "collections_description_length" CHECK ("collections"."description" is null or char_length("collections"."description") <= 2000)
);
--> statement-breakpoint
CREATE TABLE "media_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"storage_key" text NOT NULL,
	"original_filename" text,
	"mime_type" text NOT NULL,
	"byte_size" bigint NOT NULL,
	"width" integer,
	"height" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "media_assets_storage_key_valid" CHECK (btrim("media_assets"."storage_key") <> '' and char_length("media_assets"."storage_key") <= 1024),
	CONSTRAINT "media_assets_filename_length" CHECK ("media_assets"."original_filename" is null or char_length("media_assets"."original_filename") <= 255),
	CONSTRAINT "media_assets_mime_is_image" CHECK ("media_assets"."mime_type" ~ '^image/[a-z0-9.+-]+$'),
	CONSTRAINT "media_assets_byte_size_positive" CHECK ("media_assets"."byte_size" > 0),
	CONSTRAINT "media_assets_dimensions_valid" CHECK (("media_assets"."width" is null and "media_assets"."height" is null) or ("media_assets"."width" > 0 and "media_assets"."height" > 0))
);
--> statement-breakpoint
CREATE TABLE "tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tags_name_valid" CHECK (btrim("tags"."name") = "tags"."name" and "tags"."name" <> '' and char_length("tags"."name") <= 100)
);
--> statement-breakpoint
CREATE TABLE "library_field_definitions" (
	"key" text PRIMARY KEY NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"definition" jsonb NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deprecated_at" timestamp with time zone,
	CONSTRAINT "library_field_definitions_key_namespace" CHECK (starts_with("library_field_definitions"."key", 'lib.')),
	CONSTRAINT "library_field_definitions_version_positive" CHECK ("library_field_definitions"."version" >= 1),
	CONSTRAINT "library_field_definitions_definition_shape" CHECK (jsonb_typeof("library_field_definitions"."definition") = 'object' and not ("library_field_definitions"."definition" ?| array['key', 'version'])),
	CONSTRAINT "library_field_definitions_status_valid" CHECK ("library_field_definitions"."status" in ('active', 'deprecated')),
	CONSTRAINT "library_field_definitions_deprecated_at_matches_status" CHECK (("library_field_definitions"."status" = 'deprecated') = ("library_field_definitions"."deprecated_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "library_field_groups" (
	"id" text PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"parent" text,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "library_field_groups_id_namespace" CHECK (starts_with("library_field_groups"."id", 'lg_')),
	CONSTRAINT "library_field_groups_label_not_blank" CHECK (btrim("library_field_groups"."label") <> '')
);
--> statement-breakpoint
ALTER TABLE "character_references" ADD CONSTRAINT "character_references_source_character_id_characters_id_fk" FOREIGN KEY ("source_character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "character_references" ADD CONSTRAINT "character_references_target_character_id_characters_id_fk" FOREIGN KEY ("target_character_id") REFERENCES "public"."characters"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "character_collections" ADD CONSTRAINT "character_collections_collection_id_collections_id_fk" FOREIGN KEY ("collection_id") REFERENCES "public"."collections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "character_collections" ADD CONSTRAINT "character_collections_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "character_media" ADD CONSTRAINT "character_media_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "character_media" ADD CONSTRAINT "character_media_media_id_media_assets_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media_assets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "character_tags" ADD CONSTRAINT "character_tags_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "character_tags" ADD CONSTRAINT "character_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "character_references_target_idx" ON "character_references" USING btree ("target_character_id");--> statement-breakpoint
CREATE INDEX "characters_active_updated_at_idx" ON "characters" USING btree ("updated_at" DESC NULLS LAST) WHERE "characters"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "characters_active_display_name_idx" ON "characters" USING btree ("display_name") WHERE "characters"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "character_collections_character_idx" ON "character_collections" USING btree ("character_id");--> statement-breakpoint
CREATE UNIQUE INDEX "character_media_one_avatar" ON "character_media" USING btree ("character_id") WHERE "character_media"."role" = 'avatar';--> statement-breakpoint
CREATE UNIQUE INDEX "character_media_one_primary" ON "character_media" USING btree ("character_id") WHERE "character_media"."is_primary";--> statement-breakpoint
CREATE INDEX "character_media_media_idx" ON "character_media" USING btree ("media_id");--> statement-breakpoint
CREATE INDEX "character_tags_tag_idx" ON "character_tags" USING btree ("tag_id");--> statement-breakpoint
CREATE UNIQUE INDEX "collections_name_unique" ON "collections" USING btree (lower("name"));--> statement-breakpoint
CREATE UNIQUE INDEX "media_assets_storage_key_unique" ON "media_assets" USING btree ("storage_key");--> statement-breakpoint
CREATE UNIQUE INDEX "tags_name_unique" ON "tags" USING btree (lower("name"));