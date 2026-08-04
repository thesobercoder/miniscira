// Enables the pgvector extension on Neon before `drizzle-kit push` creates the
// vector columns. Run once: `bun run db:setup`, then `bun run db:push`.
import { neon } from "@neondatabase/serverless"

const url = process.env.DATABASE_URL
if (!url) {
  console.error("DATABASE_URL is not set.")
  process.exit(1)
}

const sql = neon(url)
await sql`CREATE EXTENSION IF NOT EXISTS vector`
console.log("✓ pgvector extension enabled")
