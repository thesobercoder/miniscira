// Enables required extensions before `drizzle-kit push` creates dependent
// columns and indexes. Run once: `bun run db:setup`, then `bun run db:push`.
import pg from "pg"

const url = process.env.DATABASE_URL
if (!url) {
  console.error("DATABASE_URL is not set.")
  process.exit(1)
}

const client = new pg.Client({ connectionString: url })
await client.connect()
try {
  await client.query("CREATE EXTENSION IF NOT EXISTS vector")
  await client.query("CREATE EXTENSION IF NOT EXISTS pg_trgm")
} catch (error) {
  console.error(
    "Could not enable required Postgres extensions (vector, pg_trgm). The database role must be allowed to run CREATE EXTENSION.",
    error instanceof Error ? error.message : error
  )
  await client.end()
  process.exit(1)
}
await client.end()
console.log("✓ Postgres extensions enabled: vector, pg_trgm")
