/**
 * Where uploads live in the blob store, and how big they may be.
 *
 * Shared by the token route (`/api/documents/upload-token`, which decides
 * whether to hand out an upload token) and the metadata route
 * (`/api/documents`, which decides whether to trust the blob that came back).
 * Both answer the same question — "is this path this user's?" — and answering
 * it two different ways is how one of them ends up wrong.
 */

/**
 * Uploads go straight from the browser to the blob store, so this is no longer
 * bounded by the 4.5 MB request body limit a Vercel Function imposes. What
 * still bounds it is the *other* end: text extraction fetches the blob back
 * into a function and parses it there, under that function's memory and
 * duration limits. 50 MB is comfortably inside those for real documents.
 *
 * Note this is the ingest limit, not what a model will accept — providers cap
 * PDFs and images well below this, and a file can be indexed for
 * `search_documents` while being too large to ride along as a file part.
 */
export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024

/** Everything a user uploads lives under this prefix. */
const userPrefix = (userId: string) => `documents/${userId}/`

/**
 * The blob pathname an upload should land at.
 *
 * `file.name` is attacker-controlled. The blob store's `addRandomSuffix`
 * already stops one upload overwriting another, but path segments in the name
 * would still move the object out of this user's prefix — and that prefix is
 * what proves ownership later, so flatten the name to a leaf.
 */
export function uploadPathname(userId: string, filename: string): string {
  const safeName = filename.replace(/[/\\]/g, "_").slice(-200) || "upload"
  return `${userPrefix(userId)}${safeName}`
}

/**
 * Whether a blob pathname belongs to this user.
 *
 * This is the whole trust boundary for client-direct uploads. The browser
 * finishes the upload and then tells us "here is the blob, make a row for it";
 * without this check that message would let anyone attach anyone else's file
 * to their own chat and read it back through the model.
 *
 * `addRandomSuffix` appends to the leaf, never to the prefix, so a
 * prefix match survives it.
 */
export function isOwnedUploadPath(pathname: string, userId: string): boolean {
  const prefix = userPrefix(userId)
  return (
    pathname.startsWith(prefix) && !pathname.slice(prefix.length).includes("/")
  )
}
