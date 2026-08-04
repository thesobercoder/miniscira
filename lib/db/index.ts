import { Pool } from "pg"
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres"

import * as schema from "./schema"

type DB = NodePgDatabase<typeof schema>

let _db: DB | undefined

function init(): DB {
  if (_db) return _db
  const url = process.env.DATABASE_URL
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Add your Postgres connection string to .env"
    )
  }
  // Self-hosted Postgres via node-postgres. The lazy proxy below keeps
  // building/discovery without DATABASE_URL from crashing.
  _db = drizzle(new Pool({ connectionString: url }), { schema })
  return _db
}

// Lazy proxy: the connection is created on first real use, not at import time,
// so building/discovery without DATABASE_URL doesn't crash.
export const db = new Proxy({} as DB, {
  get(_target, prop) {
    const real = init()
    const value = real[prop as keyof DB]
    return typeof value === "function" ? value.bind(real) : value
  },
}) as DB

export { schema }
