// Re-extract text from uploaded documents into `document.content`: refetch each
// blob, run the current extractor, store the result. Reports by default and
// only writes when told to.
//
//   bun run db:backfill            # report what would change
//   bun run db:backfill -- --write # apply it
//   bun run db:backfill -- --write --force  # redo documents that already have text
//
// One reason to run it: you changed `lib/document-text.ts` and want existing
// documents re-extracted. `--force` refreshes the whole corpus without
// re-uploading anything, because `search_documents` chunks from
// `document.content` at query time — refilling content is all a re-chunk takes.
//
// This is a maintainer tool for a code change, NOT part of running the app.
// Nothing in normal operation needs it: extraction happens inline at upload,
// and a file that fails is stored with `status = "error"` and shown as "Not
// searchable" in the project panel, so the fix is to remove and re-upload it.
// If you ever find yourself telling a user to run this, the bug is elsewhere.
import pg from "pg"

const url = process.env.DATABASE_URL
if (!url) {
  console.error("DATABASE_URL is not set.")
  process.exit(1)
}

const write = process.argv.includes("--write")
const force = process.argv.includes("--force")
const client = new pg.Client({ connectionString: url })
await client.connect()

const { extractDocumentText, ScannedPdfError } = await import(
  "../lib/document-text.ts"
)

const { rows } = await client.query(
  `select id, filename, mime_type, blob_url, kind, content
   from document
   where kind = 'document'
   order by created_at`
)

let filled = 0
let skipped = 0
let failed = 0

for (const row of rows) {
  if (row.content && !force) {
    skipped++
    continue
  }
  try {
    // Local-blob URLs carry the public origin; fetch over loopback instead,
    // since the hostname doesn't resolve inside the app container.
    const localUrl = row.blob_url.replace(
      /^https?:\/\/[^/]+/,
      "http://127.0.0.1:3000"
    )
    const res = await fetch(localUrl)
    if (!res.ok) throw new Error(`blob fetch ${res.status}`)
    const buffer = await res.arrayBuffer()
    const text = await extractDocumentText(buffer, row.mime_type, row.filename)
    const chars = text.trim().length
    if (chars === 0) throw new Error("extractor returned nothing")

    if (write) {
      await client.query("update document set content = $1 where id = $2", [
        text,
        row.id,
      ])
    }
    filled++
    console.log(
      `${write ? "filled " : "would fill "}${row.filename} — ${chars} chars`
    )
  } catch (err) {
    failed++
    const why =
      err instanceof ScannedPdfError ? "scanned, no text layer" : err.message
    console.log(`skip   ${row.filename} — ${why}`)
  }
}

await client.end()

console.log(
  `\n${write ? "wrote" : "dry run"}: ${filled} to fill, ${skipped} already cached, ${failed} unextractable`
)
if (!write) console.log("re-run with --write to apply")
process.exit(0)
