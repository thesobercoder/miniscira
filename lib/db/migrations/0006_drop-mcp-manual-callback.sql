ALTER TABLE "mcp_server" DROP COLUMN IF EXISTS "oauth_callback_mode";--> statement-breakpoint
ALTER TABLE "mcp_server" DROP COLUMN IF EXISTS "oauth_callback_url";--> statement-breakpoint
ALTER TABLE "mcp_server" DROP COLUMN IF EXISTS "oauth_attempt_callback_url";--> statement-breakpoint
ALTER TABLE "mcp_server" DROP COLUMN IF EXISTS "oauth_attempt_started_at";