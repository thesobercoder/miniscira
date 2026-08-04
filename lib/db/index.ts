import { neon } from "@neondatabase/serverless"
import { drizzle, type NeonHttpDatabase } from "drizzle-orm/neon-http"

import * as schema from "./schema"

type DB = NeonHttpDatabase<typeof schema>

let _db: DB | undefined

function init(): DB {
  if (_db) return _db
  const url = process.env.DATABASE_URL
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Add your Neon connection string to .env"
    )
  }
  _db = drizzle(neon(url), { schema })
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
