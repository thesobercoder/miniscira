CREATE EXTENSION IF NOT EXISTS "pg_trgm";--> statement-breakpoint
ALTER TABLE "chat" ADD COLUMN "title_search" "tsvector" GENERATED ALWAYS AS (to_tsvector('simple', coalesce(title, ''))) STORED NOT NULL;--> statement-breakpoint
CREATE INDEX "chat_title_search_idx" ON "chat" USING gin ("title_search");--> statement-breakpoint
CREATE INDEX "chat_title_trgm_idx" ON "chat" USING gin (lower("title") gin_trgm_ops);