CREATE TABLE "conversation_checkpoint" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"chat_id" uuid NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"covered_message_count" integer NOT NULL,
	"covered_message_digest" text NOT NULL,
	"summary" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "conversation_checkpoint_version_check" CHECK ("conversation_checkpoint"."version" = 1),
	CONSTRAINT "conversation_checkpoint_count_check" CHECK ("conversation_checkpoint"."covered_message_count" >= 0)
);
--> statement-breakpoint
ALTER TABLE "conversation_checkpoint" ADD CONSTRAINT "conversation_checkpoint_chat_id_chat_id_fk" FOREIGN KEY ("chat_id") REFERENCES "public"."chat"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "conversation_checkpoint_chat_digest_idx" ON "conversation_checkpoint" USING btree ("chat_id","covered_message_digest");--> statement-breakpoint
CREATE INDEX "conversation_checkpoint_chat_created_idx" ON "conversation_checkpoint" USING btree ("chat_id","created_at" DESC NULLS LAST);