import { handleUpload, type HandleUploadBody } from "@vercel/blob/client"
import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

import { ownedChat, ownedProject } from "@/lib/api-ownership"
import { auth } from "@/lib/auth"
import { attachmentKind } from "@/lib/document-text"
import { isOwnedUploadPath, MAX_UPLOAD_BYTES } from "@/lib/upload-limits"

/**
 * Hands the browser a short-lived token so it can upload straight to the blob
 * store.
 *
 * Uploads used to be posted here as multipart and forwarded on. That capped
 * every attachment at the 4.5 MB request body limit a Vercel Function has —
 * well under the size this app claimed to accept — so anything larger failed
 * with a platform 413 before the handler ran. Going direct takes the bytes off
 * that path entirely.
 *
 * This route is the only gate left in front of the store, so every check that
 * used to happen next to `put()` happens here instead, *before* a token
 * exists: who you are, whether the file is a type we can do anything with, how
 * big it may be, and whether the chat or project you are attaching it to is
 * yours.
 *
 * Deliberately not wrapped in `authed`: the blob store calls this same route
 * back on `onUploadCompleted` with no session cookie, and that callback
 * authenticates by signature instead. The token branch does its own session
 * check below.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = (await request.json()) as HandleUploadBody

  try {
    const result = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        const session = await auth.api.getSession({ headers: request.headers })
        if (!session) throw new Error("Unauthorized")
        const userId = session.user.id

        // The prefix is what proves ownership when the browser comes back with
        // "here is the blob, make a row for it", so a token is only ever issued
        // for a path inside the caller's own prefix.
        if (!isOwnedUploadPath(pathname, userId)) {
          throw new Error("Upload path does not belong to this user")
        }

        const payload = parseClientPayload(clientPayload)
        // Reject types we could never index or show, while it still costs
        // nothing. `attachmentKind` reads the extension too, which matters
        // because browsers send an empty type for .md and friends.
        if (!attachmentKind(payload.contentType, pathname)) {
          throw new Error(
            "Unsupported file type. Upload an image, a PDF, or a text file (txt, md, csv, json…)."
          )
        }

        // Parent ownership is checked here rather than at the metadata step so
        // a refusal happens before the bytes move, not after.
        const [ownsChat, ownsProject] = await Promise.all([
          payload.chatId ? ownedChat(payload.chatId, userId) : null,
          payload.projectId ? ownedProject(payload.projectId, userId) : null,
        ])
        if (payload.chatId && !ownsChat) throw new Error("Chat not found")
        if (payload.projectId && !ownsProject)
          throw new Error("Project not found")

        return {
          addRandomSuffix: true,
          maximumSizeInBytes: MAX_UPLOAD_BYTES,
        }
      },
      // The row is created by the browser's follow-up POST to /api/documents,
      // not here: this callback needs a publicly reachable URL, which a local
      // or self-hosted deployment does not have. Keeping it a no-op means one
      // code path for every deployment rather than one that only runs on
      // Vercel and silently does nothing everywhere else.
      onUploadCompleted: async () => {},
    })

    return NextResponse.json(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : "Upload was refused."
    // 400 rather than 500: everything thrown above is a rejected request, and
    // the client shows this string on the chip.
    return NextResponse.json({ error: message }, { status: 400 })
  }
}

type ClientPayload = {
  contentType: string
  chatId?: string
  projectId?: string
}

/** What the browser told us about the file it is about to send. */
function parseClientPayload(raw: string | null): ClientPayload {
  if (!raw) return { contentType: "" }
  try {
    const parsed = JSON.parse(raw) as Partial<ClientPayload>
    return {
      chatId: typeof parsed.chatId === "string" ? parsed.chatId : undefined,
      contentType:
        typeof parsed.contentType === "string" ? parsed.contentType : "",
      projectId:
        typeof parsed.projectId === "string" ? parsed.projectId : undefined,
    }
  } catch {
    return { contentType: "" }
  }
}
