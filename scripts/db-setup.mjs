// Enables the pgvector extension before `drizzle-kit push` creates the vector
// columns. Run once: `bun run db:setup`, then `bun run db:push`.
import pg from "pg"

const url = process.env.DATABASE_URL
if (!url) {
  console.error("DATABASE_URL is not set.")
  process.exit(1)
}

const client = new pg.Client({ connectionString: url })
await client.connect()
await client.query("CREATE EXTENSION IF NOT EXISTS vector")
await client.end()
console.log("✓ pgvector extension enabled")
