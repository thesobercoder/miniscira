import { and, asc, desc, eq, inArray } from "drizzle-orm"
import { NextResponse } from "next/server"
import { authed, notFound } from "@/lib/api-auth"
import { ownedChat, ownedProject } from "@/lib/api-ownership"
import { db } from "@/lib/db"
import { document } from "@/lib/db/schema"
import {
  attachmentKind,
  extractDocumentText,
  storedMimeType,
} from "@/lib/document-text"
import {
  detectImageMediaType,
  isClaimedImageUpload,
} from "@/lib/image-signature"
import { put } from "@/lib/local-blob"
import { chunkText } from "@/lib/rag"
import { MAX_UPLOAD_BYTES, uploadPathname } from "@/lib/upload-limits"

const MAX_CHUNKS = 400

// GET /api/documents[?chatId=…] — list the user's documents. With a chatId,
// returns the documents attached to that chat (each tagged with the user-turn
// index it rode along with) so the thread can render them on the right message.
export const GET = authed(async (request, { userId }) => {
  const chatId = request.nextUrl.searchParams.get("chatId")
  const docs = await db
    .select({
      id: document.id,
      kind: document.kind,
      filename: document.filename,
      mimeType: document.mimeType,
      url: document.blobUrl,
      size: document.size,
      status: document.status,
      chunkCount: document.chunkCount,
      messageIndex: document.messageIndex,
      createdAt: document.createdAt,
    })
    .from(document)
    .where(
      chatId
        ? and(eq(document.userId, userId), eq(document.chatId, chatId))
        : eq(document.userId, userId)
    )
    .orderBy(chatId ? asc(document.createdAt) : desc(document.createdAt))

  return NextResponse.json({ documents: docs })
})

// PATCH /api/documents — bind staged documents to a chat + user-turn index when
// the message they were attached to is sent.
export const PATCH = authed(async (request, { userId }) => {
  const body = (await request.json().catch(() => ({}))) as {
    ids?: string[]
    chatId?: string
    messageIndex?: number
  }
  const ids = (body.ids ?? []).filter((id) => typeof id === "string")
  if (ids.length === 0 || !body.chatId) {
    return NextResponse.json(
      { error: "ids and chatId are required" },
      { status: 400 }
    )
  }

  // The target chat must be ours — scoping the update by document.userId
  // alone still lets a caller bind their docs into someone else's chat.
  if (!(await ownedChat(body.chatId, userId))) return notFound()

  await db
    .update(document)
    .set({ chatId: body.chatId, messageIndex: body.messageIndex ?? null })
    .where(and(eq(document.userId, userId), inArray(document.id, ids)))

  return NextResponse.json({ ok: true })
})

// POST /api/documents — upload and store a file. Searchable formats also cache
// extracted text; office packages stay as original bytes for model and Sandbox use.
export const POST = authed(async (request, { userId }) => {
  const form = await request.formData().catch(() => null)
  const file = form?.get("file")
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 })
  }
  const kind = isClaimedImageUpload(file.type, file.name)
    ? "image"
    : attachmentKind(file.type, file.name)
  if (!kind) {
    return NextResponse.json(
      {
        error:
          "Unsupported file type. Upload an image, PDF, DOCX, PPTX, XLSX, or text file.",
      },
      { status: 415 }
    )
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json(
      { error: "File is too large (max 50 MB)." },
      { status: 413 }
    )
  }
  // Read once and narrow, rather than calling get() twice and asserting the
  // result: FormData.get returns `string | File | null`, so the typeof check is
  // what makes it a string — no cast needed.
  const field = (name: string) => {
    const value = form?.get(name)
    return typeof value === "string" ? value : null
  }
  const chatId = field("chatId")
  const projectId = field("projectId")
  let mimeType = storedMimeType(file.type, file.name)

  // Validate the parent ids before the upload: rejecting after `put` would
  // leave an orphan blob behind for a request we are about to refuse.
  //
  // Both checks together, and the buffer read alongside them: they are three
  // independent operations, and `lib/db` is a local Postgres pool, so each query
  // is its own round trip. Awaiting them in sequence made an upload carrying
  // both a chatId and a projectId pay for two.
  const [ownsChat, ownsProject, buffer] = await Promise.all([
    chatId ? ownedChat(chatId, userId) : null,
    projectId ? ownedProject(projectId, userId) : null,
    file.arrayBuffer(),
  ])
  if (chatId && !ownsChat) return notFound()
  if (projectId && !ownsProject) return notFound()

  if (kind === "image") {
    const detectedMimeType = detectImageMediaType(buffer)
    if (!detectedMimeType) {
      return NextResponse.json(
        { error: "The uploaded file is not a supported image." },
        { status: 415 }
      )
    }
    mimeType = detectedMimeType
  }

  let blobUrl: string
  try {
    // `file.name` is attacker-controlled. `addRandomSuffix` already stops one
    // upload overwriting another, but path segments in the name would still
    // move the object out of this user's prefix, so `uploadPathname` flattens
    // it to a leaf under the user's own prefix (shared with upstream's
    // lib/upload-limits so the trust boundary is defined in one place).
    const blob = await put(uploadPathname(userId, file.name), buffer, {
      addRandomSuffix: true,
      contentType: mimeType,
    })
    blobUrl = blob.url
  } catch (err) {
    console.error("blob upload failed", err)
    return NextResponse.json(
      { error: "Upload storage is not configured (LOCAL_STORAGE_DIR)." },
      { status: 500 }
    )
  }

  const [doc] = await db
    .insert(document)
    .values({
      userId,
      chatId,
      projectId,
      kind,
      filename: file.name,
      mimeType,
      blobUrl,
      size: file.size,
      status: kind === "image" ? "ready" : "processing",
    })
    .returning({
      id: document.id,
      filename: document.filename,
      createdAt: document.createdAt,
    })

  if (kind === "image") {
    return NextResponse.json(
      { document: { ...doc, status: "ready", kind, url: blobUrl, mimeType } },
      { status: 201 }
    )
  }

  // Searchable documents parse and cache text inline. Office packages become
  // ready without extraction so their original bytes can reach editing tools.
  try {
    const text = await extractDocumentText(buffer, file.type, file.name)
    if (text === null) {
      await db
        .update(document)
        .set({ status: "ready", chunkCount: 0 })
        .where(eq(document.id, doc.id))

      return NextResponse.json(
        {
          document: {
            ...doc,
            status: "ready",
            kind,
            url: blobUrl,
            mimeType,
            chunkCount: 0,
          },
        },
        { status: 201 }
      )
    }
    const chunks = chunkText(text).slice(0, MAX_CHUNKS)
    if (chunks.length === 0)
      throw new Error("No extractable text found in this file.")

    await db
      .update(document)
      .set({
        status: "ready",
        chunkCount: chunks.length,
        // Cache the extraction: search reads this instead of refetching and
        // reparsing the blob, and it's what lets an extractor upgrade re-chunk
        // the corpus without touching storage.
        content: text,
      })
      .where(eq(document.id, doc.id))

    return NextResponse.json(
      {
        document: {
          ...doc,
          status: "ready",
          kind,
          url: blobUrl,
          mimeType,
          chunkCount: chunks.length,
        },
      },
      { status: 201 }
    )
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Couldn't read that document."
    await db
      .update(document)
      .set({ status: "error", error: message })
      .where(eq(document.id, doc.id))
    return NextResponse.json(
      {
        document: { ...doc, status: "error", kind, url: blobUrl, mimeType },
        error: message,
      },
      { status: 200 }
    )
  }
})
