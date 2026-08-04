import { defineConfig } from "drizzle-kit"

// Fail with a readable message instead of asserting non-null and letting the
// driver report a confusing "invalid connection string" later.
const url = process.env.DATABASE_URL
if (!url) throw new Error("DATABASE_URL is required to run drizzle-kit")

export default defineConfig({
  schema: "./lib/db/schema.ts",
  out: "./lib/db/migrations",
  dialect: "postgresql",
  dbCredentials: { url },
})
