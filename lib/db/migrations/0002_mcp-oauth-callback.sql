ALTER TABLE "mcp_server" ADD COLUMN "oauth_callback_mode" text DEFAULT 'automatic' NOT NULL;--> statement-breakpoint
ALTER TABLE "mcp_server" ADD COLUMN "oauth_callback_url" text;--> statement-breakpoint
ALTER TABLE "mcp_server" ADD COLUMN "oauth_attempt_callback_url" text;--> statement-breakpoint
ALTER TABLE "mcp_server" ADD COLUMN "oauth_attempt_started_at" timestamp;