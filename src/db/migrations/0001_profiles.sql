CREATE TABLE "content_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"section_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"content" jsonb NOT NULL,
	"content_hash" text NOT NULL,
	"restored_from_id" uuid,
	"fact_snapshot" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "content_revisions_id_section_unique" UNIQUE("id","section_id"),
	CONSTRAINT "content_revisions_kind_valid" CHECK ("content_revisions"."kind" in ('autosave', 'approval', 'before_restore', 'restore', 'conflict')),
	CONSTRAINT "content_revisions_content_is_doc" CHECK (jsonb_typeof("content_revisions"."content") = 'object' and "content_revisions"."content" ->> 'type' = 'doc'),
	CONSTRAINT "content_revisions_hash_present" CHECK ("content_revisions"."content_hash" <> ''),
	CONSTRAINT "content_revisions_snapshot_shape" CHECK ("content_revisions"."fact_snapshot" is null or jsonb_typeof("content_revisions"."fact_snapshot") = 'object')
);
--> statement-breakpoint
CREATE TABLE "profile_sections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" uuid NOT NULL,
	"key" text NOT NULL,
	"title" text,
	"position" integer NOT NULL,
	"is_hidden" boolean DEFAULT false NOT NULL,
	"source_groups" text[] DEFAULT '{}'::text[] NOT NULL,
	"draft_content" jsonb,
	"draft_revision" integer DEFAULT 1 NOT NULL,
	"draft_updated_at" timestamp with time zone,
	"approved_revision_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "profile_sections_profile_key_unique" UNIQUE("profile_id","key"),
	CONSTRAINT "profile_sections_key_format" CHECK ("profile_sections"."key" ~ '^(ps_[a-z0-9]{6,40}|[a-z][a-z_]{1,39})$'),
	CONSTRAINT "profile_sections_title_valid" CHECK ("profile_sections"."title" is null or (btrim("profile_sections"."title") = "profile_sections"."title" and "profile_sections"."title" <> '' and char_length("profile_sections"."title") <= 120)),
	CONSTRAINT "profile_sections_position_valid" CHECK ("profile_sections"."position" >= 0),
	CONSTRAINT "profile_sections_draft_revision_positive" CHECK ("profile_sections"."draft_revision" >= 1),
	CONSTRAINT "profile_sections_draft_is_doc" CHECK ("profile_sections"."draft_content" is null or (jsonb_typeof("profile_sections"."draft_content") = 'object' and "profile_sections"."draft_content" ->> 'type' = 'doc')),
	CONSTRAINT "profile_sections_source_groups_limit" CHECK (cardinality("profile_sections"."source_groups") <= 40)
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"character_id" uuid NOT NULL,
	"is_primary" boolean DEFAULT true NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "profiles_revision_positive" CHECK ("profiles"."revision" >= 1)
);
--> statement-breakpoint
ALTER TABLE "content_revisions" ADD CONSTRAINT "content_revisions_section_id_profile_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."profile_sections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_revisions" ADD CONSTRAINT "content_revisions_restored_from_id_content_revisions_id_fk" FOREIGN KEY ("restored_from_id") REFERENCES "public"."content_revisions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_sections" ADD CONSTRAINT "profile_sections_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_sections" ADD CONSTRAINT "profile_sections_approved_revision_fk" FOREIGN KEY ("approved_revision_id","id") REFERENCES "public"."content_revisions"("id","section_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "content_revisions_section_created_idx" ON "content_revisions" USING btree ("section_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "profiles_one_primary_idx" ON "profiles" USING btree ("character_id") WHERE "profiles"."is_primary";--> statement-breakpoint
CREATE INDEX "profiles_character_idx" ON "profiles" USING btree ("character_id");