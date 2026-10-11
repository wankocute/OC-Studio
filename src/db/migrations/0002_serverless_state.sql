CREATE TABLE "ai_section_jobs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"section_id" uuid NOT NULL,
	"status" text NOT NULL,
	"title" text NOT NULL,
	"model_id" text NOT NULL,
	"model_label" text NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"deadline_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone,
	"result" jsonb,
	"error_code" text,
	"error_message" text,
	"expires_at" timestamp with time zone,
	CONSTRAINT "ai_section_jobs_status_valid" CHECK ("ai_section_jobs"."status" in ('queued', 'running', 'succeeded', 'failed', 'cancelled')),
	CONSTRAINT "ai_section_jobs_finished_consistent" CHECK (("ai_section_jobs"."status" in ('queued', 'running')) = ("ai_section_jobs"."finished_at" is null and "ai_section_jobs"."expires_at" is null))
);
--> statement-breakpoint
CREATE TABLE "ai_section_tokens" (
	"id" uuid PRIMARY KEY NOT NULL,
	"section_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"payload" jsonb NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_section_tokens_kind_valid" CHECK ("ai_section_tokens"."kind" in ('preview', 'candidate'))
);
--> statement-breakpoint
CREATE TABLE "login_failures" (
	"client_key" text PRIMARY KEY NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"failures" integer NOT NULL,
	CONSTRAINT "login_failures_key_valid" CHECK ("login_failures"."client_key" <> '' and char_length("login_failures"."client_key") <= 120),
	CONSTRAINT "login_failures_count_positive" CHECK ("login_failures"."failures" >= 1)
);
--> statement-breakpoint
ALTER TABLE "ai_section_jobs" ADD CONSTRAINT "ai_section_jobs_section_id_profile_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."profile_sections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_section_tokens" ADD CONSTRAINT "ai_section_tokens_section_id_profile_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."profile_sections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ai_section_jobs_one_active_idx" ON "ai_section_jobs" USING btree ("section_id") WHERE "ai_section_jobs"."status" in ('queued', 'running');--> statement-breakpoint
CREATE INDEX "ai_section_jobs_section_started_idx" ON "ai_section_jobs" USING btree ("section_id","started_at");--> statement-breakpoint
CREATE INDEX "ai_section_jobs_expires_idx" ON "ai_section_jobs" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "ai_section_tokens_expires_idx" ON "ai_section_tokens" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "ai_section_tokens_section_idx" ON "ai_section_tokens" USING btree ("section_id");--> statement-breakpoint
CREATE INDEX "login_failures_window_idx" ON "login_failures" USING btree ("window_start");