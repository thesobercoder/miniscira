#!/usr/bin/env node
/**
 * MiniScira container entrypoint (Phase 2).
 *
 * Order of operations:
 *   1. Require DATABASE_URL (fail fast with a readable message).
 *   2. Wait for the database (node `pg` client, retry loop) so the image
 *      works under any orchestrator, not only Compose with a health-gated
 *      `depends_on`.
 *   3. Transitional schema gate: only when RUN_DB_PUSH=true, run
 *      `drizzle-kit push` under a Postgres advisory lock (one instance wins;
 *      others skip with a warning). Default false — normal startup never
 *      mutates the schema. The committed-migration path (one-shot `migrate`
 *      compose service, `scripts/migrate.mjs`) is the target; this gate
 *      exists for stack-30 continuity only.
 *   4. Start eve + next under two-process supervision (scripts/supervise.mjs):
 *      either half dying takes the container down with the right exit code,
 *      and signals are forwarded to both halves.
 *
 * Env:
 *   DATABASE_URL                 required
 *   RUN_DB_PUSH                   "true" to enable the transitional gate (default off)
 *   DB_WAIT_TIMEOUT_MS            how long to wait for the DB (default 90000)
 *   RUN_DB_PUSH_LOCK_TIMEOUT_MS   how long to wait for the advisory lock (default 60000)
 */
import { spawn } from "node:child_process"
import { Pool } from "pg"

import { supervise } from "./supervise.mjs"

const DB_WAIT_TIMEOUT_MS = Number(process.env.DB_WAIT_TIMEOUT_MS ?? 90_000)
const DB_WAIT_INTERVAL_MS = 2_000
// Advisory lock key for the schema gate: 0x4D494E49 ("MINI").
const PUSH_LOCK_KEY = 1_296_121_417
const PUSH_LOCK_TIMEOUT_MS = Number(process.env.RUN_DB_PUSH_LOCK_TIMEOUT_MS ?? 60_000)

function log(msg) {
  console.log(`[entrypoint] ${msg}`)
}

async function waitForDatabase(url) {
  const pool = new Pool({ connectionString: url, max: 1 })
  const deadline = Date.now() + DB_WAIT_TIMEOUT_MS
  let attempt = 0
  for (;;) {
    try {
      await pool.query("SELECT 1")
      await pool.end().catch(() => {})
      return
    } catch (err) {
      attempt += 1
      if (Date.now() > deadline) {
        await pool.end().catch(() => {})
        throw new Error(
          `database not reachable after ${DB_WAIT_TIMEOUT_MS}ms (${err.message})`
        )
      }
      log(`waiting for database (attempt ${attempt}): ${err.message}`)
      await new Promise((resolve) => setTimeout(resolve, DB_WAIT_INTERVAL_MS))
    }
  }
}

async function runGatedPush(url) {
  const pool = new Pool({ connectionString: url, max: 1 })
  const deadline = Date.now() + PUSH_LOCK_TIMEOUT_MS
  let acquired = false
  for (;;) {
    const { rows } = await pool.query("SELECT pg_try_advisory_lock($1) AS ok", [
      PUSH_LOCK_KEY,
    ])
    if (rows[0].ok) {
      acquired = true
      break
    }
    if (Date.now() > deadline) break
    await new Promise((resolve) => setTimeout(resolve, 2_000))
  }
  if (!acquired) {
    log(
      "RUN_DB_PUSH=true but advisory lock not acquirable within timeout — " +
        "another instance is likely pushing; SKIPPING schema push"
    )
    await pool.end().catch(() => {})
    return { ok: true, skipped: true }
  }
  log("advisory lock acquired; running drizzle-kit push")
  const code = await new Promise((resolve) => {
    const child = spawn(
      "node",
      ["node_modules/drizzle-kit/bin.cjs", "push", "--force"],
      { stdio: "inherit" }
    )
    child.once("exit", (exitCode) => resolve(exitCode ?? 1))
  })
  await pool
    .query("SELECT pg_advisory_unlock($1)", [PUSH_LOCK_KEY])
    .catch(() => {})
  await pool.end().catch(() => {})
  return { ok: code === 0, code }
}

const url = process.env.DATABASE_URL
if (!url) {
  console.error(
    "[entrypoint] DATABASE_URL is not set — cannot start. " +
      "Point it at your Postgres (pgvector) database."
  )
  process.exit(1)
}
process.env.NODE_ENV ??= "production"

try {
  await waitForDatabase(url)
  log("database reachable")
} catch (err) {
  console.error(`[entrypoint] ${err.message}`)
  process.exit(1)
}

if (process.env.RUN_DB_PUSH === "true") {
  const result = await runGatedPush(url)
  if (!result.ok) {
    console.error(
      `[entrypoint] drizzle-kit push failed with exit code ${result.code} — refusing to start`
    )
    process.exit(result.code ?? 1)
  }
  log(result.skipped ? "schema push skipped (lock busy)" : "schema push completed")
}

log("starting eve (port 4274) and next (port 3000) under supervision")
const code = await supervise([
  "node node_modules/eve/bin/eve.js start --port 4274",
  "node node_modules/next/dist/bin/next start",
])
process.exit(code)
