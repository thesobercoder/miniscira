import { head } from "@vercel/blob"
import { and, asc, desc, eq, inArray } from "drizzle-orm"
import { NextResponse } from "next/server"

import { authed, notFound } from "@/lib/api-auth"
import { ownedChat, ownedProject } from "@/lib/api-ownership"
import { db } from "@/lib/db"
import { document } from "@/lib/db/schema"
import { attachmentKind, extractDocumentText } from "@/lib/document-text"
import { chunkText } from "@/lib/rag"
import { isOwnedUploadPath, MAX_UPLOAD_BYTES } from "@/lib/upload-limits"

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

// POST /api/documents — record a file the browser has already uploaded
// straight to the blob store, then extract and cache its text. No embedding
// step: `search_documents` chunks and ranks on demand.
//
// The bytes never pass through here. They used to, as multipart, which capped
// every attachment at the 4.5 MB request body limit a Vercel Function has —
// below the size this route claimed to accept, so larger files died on a
// platform 413 before the handler ran. The browser now uploads directly (see
// `/api/documents/upload-token`) and posts the resulting blob URL here.
export const POST = authed(async (request, { userId }) => {
  const body = (await request.json().catch(() => ({}))) as {
    url?: string
    filename?: string
    chatId?: string
    projectId?: string
  }
  if (typeof body.url !== "string" || typeof body.filename !== "string") {
    return NextResponse.json(
      { error: "url and filename are required" },
      { status: 400 }
    )
  }
  const filename = body.filename.slice(-200) || "upload"

  // The store is the authority on what actually landed, not the caller. Size
  // and content type come from `head` rather than from the request so a client
  // cannot describe a 2 KB text file and attach a 400 MB one.
  let blob: Awaited<ReturnType<typeof head>>
  try {
    blob = await head(body.url)
  } catch {
    return NextResponse.json(
      { error: "That upload could not be found." },
      { status: 404 }
    )
  }

  // The trust boundary for client-direct uploads. Without it, posting someone
  // else's blob URL would attach their file to your chat and read it back
  // through the model. `notFound` rather than `forbidden`: a caller poking at
  // other people's paths learns nothing about which ones exist.
  if (!isOwnedUploadPath(blob.pathname, userId)) return notFound()

  if (blob.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json(
      { error: "File is too large (max 50 MB)." },
      { status: 413 }
    )
  }

  const mimeType = blob.contentType || "application/octet-stream"
  const kind = attachmentKind(mimeType, filename)
  if (!kind) {
    return NextResponse.json(
      {
        error:
          "Unsupported file type. Upload an image, a PDF, or a text file (txt, md, csv, json…).",
      },
      { status: 415 }
    )
  }

  const chatId = body.chatId ?? null
  const projectId = body.projectId ?? null
  // Both checks together: they are independent, and `lib/db` is the Neon HTTP
  // driver, so each query is its own round trip. Awaiting them in sequence made
  // an upload carrying both a chatId and a projectId pay for two.
  //
  // The token route already refused the upload if these weren't ours, so
  // reaching a failure here means the parent was deleted mid-upload.
  const [ownsChat, ownsProject] = await Promise.all([
    chatId ? ownedChat(chatId, userId) : null,
    projectId ? ownedProject(projectId, userId) : null,
  ])
  if (chatId && !ownsChat) return notFound()
  if (projectId && !ownsProject) return notFound()

  const blobUrl = blob.url
  const [doc] = await db
    .insert(document)
    .values({
      userId,
      chatId,
      projectId,
      kind,
      filename,
      mimeType,
      blobUrl,
      size: blob.size,
      status: kind === "image" ? "ready" : "processing",
    })
    .returning({
      id: document.id,
      filename: document.filename,
      createdAt: document.createdAt,
    })

  // Images are sent straight to the model as vision input — no parsing/embedding.
  if (kind === "image") {
    return NextResponse.json(
      { document: { ...doc, status: "ready", kind, url: blobUrl, mimeType } },
      { status: 201 }
    )
  }

  // Documents: parse and cache the text. Inline, so the client learns straight
  // away whether the file is searchable — and so a scanned PDF is reported here
  // rather than as a mystery empty result three questions later. No embedding
  // step: `search_documents` chunks this text and ranks it on demand.
  //
  // The bytes come back from the store rather than off the request, since the
  // upload went straight there. That download sits inside the try on purpose: a
  // store we can't reach should mark the row unreadable, the same as a PDF we
  // can't parse, rather than throw and leave it stuck on "processing" forever.
  try {
    const stored = await fetch(blobUrl)
    if (!stored.ok)
      throw new Error(`Couldn't read that document (${stored.status}).`)
    const buffer = await stored.arrayBuffer()
    const text = await extractDocumentText(buffer, mimeType, filename)
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
