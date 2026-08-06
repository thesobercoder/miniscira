#!/usr/bin/env node
/**
 * One-shot migration runner (Phase 2 target path).
 *
 * Applies the COMMITTED drizzle migrations in lib/db/migrations/ to the
 * database. Two entry conditions:
 *
 *   FRESH database (no public tables):
 *     ensures the pgvector extension exists, then applies every migration.
 *
 *   EXISTING database (tables already present, e.g. a stack adopted from the
 *     pre-migration era): stamps the current migration set as applied in
 *     drizzle.__drizzle_migrations ("baseline adoption") and exits without
 *     re-running DDL. Future migrations (0001, …) then apply normally.
 *
 * Used as a one-shot Compose service:
 *   docker compose --profile migrate run --rm migrate
 *
 * Env: DATABASE_URL (required)
 */
import { createHash } from "node:crypto"
import { existsSync, readFileSync } from "node:fs"
import path from "node:path"

import { drizzle } from "drizzle-orm/node-postgres"
import { migrate } from "drizzle-orm/node-postgres/migrator"
import { Pool } from "pg"

const MIGRATIONS_DIR = path.join(process.cwd(), "lib/db/migrations")
const JOURNAL_PATH = path.join(MIGRATIONS_DIR, "meta/_journal.json")

function log(msg) {
  console.log(`[migrate] ${msg}`)
}

const url = process.env.DATABASE_URL
if (!url) {
  console.error("[migrate] DATABASE_URL is not set — nothing to migrate against.")
  process.exit(1)
}
if (!existsSync(JOURNAL_PATH)) {
  console.error(`[migrate] no migration journal at ${JOURNAL_PATH}`)
  process.exit(1)
}

const journal = JSON.parse(readFileSync(JOURNAL_PATH, "utf8"))
const entries = journal.entries.map((entry) => {
  const sql = readFileSync(
    path.join(MIGRATIONS_DIR, `${entry.tag}.sql`),
    "utf8"
  )
  return {
    tag: entry.tag,
    when: entry.when,
    hash: createHash("sha256").update(sql).digest("hex"),
  }
})
log(`loaded ${entries.length} migration(s): ${entries.map((e) => e.tag).join(", ")}`)

const pool = new Pool({ connectionString: url, max: 1 })

async function publicTableCount() {
  const { rows } = await pool.query(
    "SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema = 'public'"
  )
  return rows[0].n
}

async function trackingState() {
  const { rows } = await pool.query(
    "SELECT to_regclass('drizzle.__drizzle_migrations') AS t"
  )
  if (rows[0].t === null) return { exists: false, rows: 0 }
  const { rows: count } = await pool.query(
    "SELECT count(*)::int AS n FROM drizzle.__drizzle_migrations"
  )
  return { exists: true, rows: count[0].n }
}

async function stampBaseline() {
  await pool.query("CREATE SCHEMA IF NOT EXISTS drizzle")
  await pool.query(
    `CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (
       id SERIAL PRIMARY KEY,
       hash text NOT NULL,
       created_at bigint
     )`
  )
  for (const entry of entries) {
    await pool.query(
      "INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ($1, $2) ON CONFLICT DO NOTHING",
      [entry.hash, entry.when]
    )
  }
}

try {
  const hasTables = (await publicTableCount()) > 0
  const tracking = await trackingState()

  // The vector extension is required by the schema but is not part of the
  // committed SQL (extensions are cluster-level, not schema objects). The DB
  // owner can create it on pgvector images; managed Postgres may not allow
  // it — log the outcome either way and let the migration surface a clear
  // error if it is actually missing.
  try {
    await pool.query("CREATE EXTENSION IF NOT EXISTS vector")
    log("pgvector extension present (or created)")
  } catch (err) {
    log(
      `WARNING: could not ensure pgvector extension (${err.message}) — ` +
        "migration may fail if vector columns are needed"
    )
  }

  if (hasTables && (!tracking.exists || tracking.rows === 0)) {
    await stampBaseline()
    log(
      `existing schema detected (${await publicTableCount()} public tables); ` +
        `stamped ${entries.length} migration(s) as applied — no DDL executed`
    )
    process.exitCode = 0
  } else {
    const db = drizzle(pool)
    await migrate(db, { migrationsFolder: MIGRATIONS_DIR })
    const { rows } = await pool.query(
      "SELECT count(*)::int AS n FROM drizzle.__drizzle_migrations"
    )
    log(`migrations applied; tracking table has ${rows[0].n} row(s)`)
    process.exitCode = 0
  }
} catch (err) {
  console.error(`[migrate] FAILED: ${err.message}`)
  process.exitCode = 1
} finally {
  await pool.end().catch(() => {})
}
