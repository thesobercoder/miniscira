CREATE TABLE "lookout_run" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"lookout_id" uuid,
	"lookout_user_id" text,
	"project_id" uuid,
	"project_user_id" text,
	"retry_of_run_id" uuid,
	"retry_of_user_id" text,
	"report_chat_id" uuid,
	"report_chat_user_id" text,
	"lookout_name" text NOT NULL,
	"prompt" text NOT NULL,
	"schedule" text NOT NULL,
	"timezone" text NOT NULL,
	"frequency" text NOT NULL,
	"trigger" text NOT NULL,
	"status" text NOT NULL,
	"started_at" timestamp NOT NULL,
	"finished_at" timestamp,
	"leased_until" timestamp,
	"lease_owner" text,
	"failure_code" text,
	"email_sent_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "lookout_run_report_chat_id_unique" UNIQUE("report_chat_id"),
	CONSTRAINT "lookout_run_id_user_id_unique" UNIQUE("id","user_id"),
	CONSTRAINT "lookout_run_trigger_check" CHECK ("lookout_run"."trigger" in ('scheduled', 'manual', 'retry')),
	CONSTRAINT "lookout_run_status_check" CHECK ("lookout_run"."status" in ('claimed', 'running', 'succeeded', 'failed', 'cancelled')),
	CONSTRAINT "lookout_run_retry_check" CHECK ("lookout_run"."retry_of_run_id" is null or "lookout_run"."retry_of_run_id" <> "lookout_run"."id"),
	CONSTRAINT "lookout_run_owner_provenance_check" CHECK (("lookout_run"."lookout_id" is null and "lookout_run"."lookout_user_id" is null or "lookout_run"."lookout_id" is not null and "lookout_run"."lookout_user_id" = "lookout_run"."user_id") and ("lookout_run"."project_id" is null and "lookout_run"."project_user_id" is null or "lookout_run"."project_id" is not null and "lookout_run"."project_user_id" = "lookout_run"."user_id") and ("lookout_run"."retry_of_run_id" is null and "lookout_run"."retry_of_user_id" is null or "lookout_run"."retry_of_run_id" is not null and "lookout_run"."retry_of_user_id" = "lookout_run"."user_id") and ("lookout_run"."report_chat_id" is null and "lookout_run"."report_chat_user_id" is null or "lookout_run"."report_chat_id" is not null and "lookout_run"."report_chat_user_id" = "lookout_run"."user_id")),
	CONSTRAINT "lookout_run_retry_trigger_check" CHECK (("lookout_run"."trigger" = 'retry') = ("lookout_run"."retry_of_run_id" is not null)),
	CONSTRAINT "lookout_run_finished_check" CHECK (("lookout_run"."status" in ('claimed', 'running') and "lookout_run"."finished_at" is null) or ("lookout_run"."status" in ('succeeded', 'failed', 'cancelled') and "lookout_run"."finished_at" is not null)),
	CONSTRAINT "lookout_run_failure_code_check" CHECK ("lookout_run"."status" = 'failed' or "lookout_run"."failure_code" is null),
	CONSTRAINT "lookout_run_report_state_check" CHECK (("lookout_run"."status" = 'succeeded' and "lookout_run"."report_chat_id" is not null) or ("lookout_run"."status" = 'failed') or ("lookout_run"."status" in ('claimed', 'running', 'cancelled') and "lookout_run"."report_chat_id" is null)),
	CONSTRAINT "lookout_run_lease_check" CHECK (("lookout_run"."leased_until" is null) = ("lookout_run"."lease_owner" is null) and ("lookout_run"."status" in ('claimed', 'running') or "lookout_run"."leased_until" is null)),
	CONSTRAINT "lookout_run_email_check" CHECK ("lookout_run"."email_sent_at" is null or ("lookout_run"."status" = 'succeeded' and "lookout_run"."report_chat_id" is not null))
);
--> statement-breakpoint
ALTER TABLE "chat" ADD COLUMN "last_activity_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "chat" ADD COLUMN "archived_at" timestamp;--> statement-breakpoint
ALTER TABLE "chat" ADD COLUMN "archive_reason" text;--> statement-breakpoint
ALTER TABLE "chat" ADD COLUMN "archive_state_changed_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "chat" ADD COLUMN "pinned_at" timestamp;--> statement-breakpoint
ALTER TABLE "chat" ADD COLUMN "active_run_until" timestamp;--> statement-breakpoint
UPDATE "chat"
SET "last_activity_at" = "updated_at",
    "archive_state_changed_at" = "updated_at";--> statement-breakpoint
ALTER TABLE "chat" ADD CONSTRAINT "chat_id_user_id_unique" UNIQUE("id","user_id");--> statement-breakpoint
ALTER TABLE "lookout" ADD CONSTRAINT "lookout_id_user_id_unique" UNIQUE("id","user_id");--> statement-breakpoint
ALTER TABLE "project" ADD CONSTRAINT "project_id_user_id_unique" UNIQUE("id","user_id");--> statement-breakpoint
ALTER TABLE "lookout_run" ADD CONSTRAINT "lookout_run_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lookout_run" ADD CONSTRAINT "lookout_run_lookout_owner_fk" FOREIGN KEY ("lookout_id","lookout_user_id") REFERENCES "public"."lookout"("id","user_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lookout_run" ADD CONSTRAINT "lookout_run_project_owner_fk" FOREIGN KEY ("project_id","project_user_id") REFERENCES "public"."project"("id","user_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lookout_run" ADD CONSTRAINT "lookout_run_retry_owner_fk" FOREIGN KEY ("retry_of_run_id","retry_of_user_id") REFERENCES "public"."lookout_run"("id","user_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lookout_run" ADD CONSTRAINT "lookout_run_report_chat_owner_fk" FOREIGN KEY ("report_chat_id","report_chat_user_id") REFERENCES "public"."chat"("id","user_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
INSERT INTO "lookout_run" (
  "user_id", "lookout_id", "lookout_user_id", "project_id", "project_user_id",
  "report_chat_id", "report_chat_user_id", "lookout_name", "prompt", "schedule",
  "timezone", "frequency", "trigger", "status", "started_at", "finished_at",
  "created_at", "updated_at"
)
SELECT
  c."user_id",
  CASE WHEN l."user_id" = c."user_id" THEN c."lookout_id" ELSE NULL END,
  CASE WHEN l."user_id" = c."user_id" THEN c."user_id" ELSE NULL END,
  CASE WHEN p."id" IS NULL THEN NULL ELSE c."project_id" END,
  CASE WHEN p."id" IS NULL THEN NULL ELSE c."user_id" END,
  c."id", c."user_id", l."name", l."prompt",
  COALESCE(l."cron", l."run_at"::text, c."created_at"::text),
  l."timezone", l."frequency", 'scheduled', 'succeeded',
  c."created_at", c."created_at", c."created_at", c."updated_at"
FROM "chat" c
JOIN "lookout" l ON l."id" = c."lookout_id"
LEFT JOIN "project" p ON p."id" = c."project_id" AND p."user_id" = c."user_id"
WHERE c."lookout_id" IS NOT NULL
ON CONFLICT ("report_chat_id") DO NOTHING;--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "chat" c
    WHERE c."lookout_id" IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM "lookout_run" lr
        WHERE lr."report_chat_id" = c."id" AND lr."user_id" = c."user_id"
      )
  ) THEN
    RAISE EXCEPTION 'legacy Lookout report reconciliation failed';
  END IF;
END $$;--> statement-breakpoint
CREATE INDEX "lookout_run_history_idx" ON "lookout_run" USING btree ("user_id","lookout_id","started_at" DESC NULLS LAST,"id");--> statement-breakpoint
CREATE INDEX "lookout_run_latest_idx" ON "lookout_run" USING btree ("lookout_id","started_at" DESC NULLS LAST,"id");--> statement-breakpoint
CREATE INDEX "chat_active_history_idx" ON "chat" USING btree ("user_id","last_activity_at" DESC NULLS LAST,"id") WHERE "chat"."archived_at" is null and "chat"."lookout_id" is null;--> statement-breakpoint
CREATE INDEX "chat_archived_history_idx" ON "chat" USING btree ("user_id","archived_at" DESC NULLS LAST,"id") WHERE "chat"."archived_at" is not null and "chat"."lookout_id" is null;--> statement-breakpoint
CREATE INDEX "chat_active_project_history_idx" ON "chat" USING btree ("user_id","project_id","last_activity_at" DESC NULLS LAST,"id") WHERE "chat"."archived_at" is null and "chat"."lookout_id" is null;--> statement-breakpoint
CREATE INDEX "chat_auto_archive_idx" ON "chat" USING btree ("user_id","last_activity_at") WHERE "chat"."archived_at" is null and "chat"."lookout_id" is null and "chat"."pinned_at" is null and "chat"."active_run_until" is null;--> statement-breakpoint
ALTER TABLE "chat" ADD CONSTRAINT "chat_archive_reason_check" CHECK ("chat"."archive_reason" is null or "chat"."archive_reason" in ('manual', 'inactivity'));