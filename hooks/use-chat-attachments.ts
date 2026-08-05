"use client"

import { upload } from "@vercel/blob/client"
import { useCallback, useRef, useState } from "react"
import { toast } from "sonner"
import { useMountEffect } from "@/hooks/use-mount-effect"
import { mutateOrToast } from "@/lib/api-client"
import { authClient } from "@/lib/auth-client"
import { uploadPathname } from "@/lib/upload-limits"

/**
 * Owns the attachment lifecycle for one chat: files staged in the composer for
 * the next message, the optimistic upload/preview dance, and the sent
 * attachments grouped by the user turn they rode along with.
 */

export type UploadedDoc = {
  id: string
  filename: string
  status: "processing" | "ready" | "error"
  kind?: "document" | "image"
  url?: string
  mimeType?: string
  messageIndex?: number | null
  /** Why the upload failed, shown on the chip so the error isn't just an icon. */
  error?: string
  /**
   * The original File, kept only for staged uploads so a failed one can be
   * retried without asking the user to pick it again. Absent on anything
   * rehydrated from the server.
   */
  file?: File
}

export const DOC_ACCEPT =
  "image/*,.png,.jpg,.jpeg,.webp,.gif,.avif,.pdf,.txt,.md,.markdown,.csv,.json,.log,.tsv,.html,.xml,.yaml,.yml,text/*,application/pdf"

/**
 * Above this, the upload is split into parts that go up in parallel and retry
 * individually. Below it the extra round trips cost more than they save — most
 * attachments here are a page or two of PDF.
 */
const MULTIPART_THRESHOLD_BYTES = 8 * 1024 * 1024

/**
 * This browser's user id, fetched once.
 *
 * Uploads land under `documents/<userId>/`, and that prefix is the only thing
 * proving the file is yours when the row is created — so the destination can't
 * be named without it. Shared across uploads rather than read per file, and
 * cleared on failure so a request that ran while signed out doesn't poison
 * every upload after it.
 */
let cachedUserId: Promise<string> | null = null
function currentUserId(): Promise<string> {
  cachedUserId ??= authClient
    .getSession()
    .then((result) => {
      const id = result.data?.user?.id
      if (!id) throw new Error("You need to be signed in to upload files.")
      return id
    })
    .catch((err: unknown) => {
      cachedUserId = null
      throw err
    })
  return cachedUserId
}

type Options = {
  chatId?: string
  projectId?: string
  /** Read lazily: the chat row may not exist until the first message is sent. */
  currentChatId: () => string | undefined
}

export function useChatAttachments({
  chatId,
  projectId,
  currentChatId,
}: Options) {
  // Staged in the composer for the NEXT message; cleared when it's sent.
  const [documents, setDocuments] = useState<UploadedDoc[]>([])
  // Mirror for callbacks that must stay reference-stable: the composer is
  // memoized, so a handler that changed identity per staged file would
  // re-render it on every keystroke of an unrelated upload.
  const documentsRef = useRef(documents)
  documentsRef.current = documents
  // Sent attachments, grouped by the user-turn index they rode along with.
  const [attachmentsByTurn, setAttachmentsByTurn] = useState<
    Record<number, UploadedDoc[]>
  >({})

  // Re-hydrate this chat's attachments (by turn) so they render on the right
  // message after a reload.
  // Mount-only: a different chat is a different route, which remounts this
  // component, so chatId never changes underneath us.
  useMountEffect(() => {
    if (!chatId) return
    let active = true
    fetch(`/api/documents?chatId=${chatId}`)
      .then((r) => (r.ok ? r.json() : { documents: [] }))
      .then((d: { documents?: UploadedDoc[] }) => {
        if (!active || !Array.isArray(d.documents)) return
        const byTurn: Record<number, UploadedDoc[]> = {}
        for (const doc of d.documents) {
          if (doc.messageIndex == null) continue
          byTurn[doc.messageIndex] ??= []
          byTurn[doc.messageIndex].push(doc)
        }
        setAttachmentsByTurn(byTurn)
      })
      .catch(() => {})
    return () => {
      active = false
    }
  })

  const uploadFiles = useCallback(
    async (files: FileList | File[]) => {
      const list = Array.from(files)
      if (list.length === 0) return
      // Concurrent: each file owns its own optimistic row (keyed by tempId), so
      // nothing here depends on ordering. Sequential awaits meant dropping four
      // files cost four round trips end to end.
      const uploadOne = async (file: File) => {
        const tempId = `tmp-${file.name}-${file.size}-${file.lastModified}`
        const isImage = file.type.startsWith("image/")
        const previewUrl = isImage ? URL.createObjectURL(file) : undefined
        setDocuments((prev) => [
          {
            id: tempId,
            filename: file.name,
            status: "processing",
            kind: isImage ? "image" : "document",
            url: previewUrl,
            mimeType: file.type,
            // Kept so a failure can offer Retry instead of a dead-end icon.
            file,
          },
          ...prev.filter((d) => d.id !== tempId),
        ])
        const id = currentChatId()
        try {
          // Straight to the blob store, not through /api/documents. Posting the
          // file to a route handler put it in a Vercel Function's request body,
          // which is capped at 4.5 MB, so anything larger failed with a
          // platform 413 that never reached our own error handling. `multipart`
          // splits big files, uploads the parts in parallel, and retries the
          // ones that fail.
          const owner = await currentUserId()
          const blob = await upload(uploadPathname(owner, file.name), file, {
            access: "public",
            handleUploadUrl: "/api/documents/upload-token",
            multipart: file.size > MULTIPART_THRESHOLD_BYTES,
            clientPayload: JSON.stringify({
              chatId: id,
              contentType: file.type,
              projectId,
            }),
          })
          // The row is ours to create now that the bytes have landed. Until
          // this returns the upload is a blob nothing references.
          const res = await fetch("/api/documents", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              chatId: id,
              filename: file.name,
              projectId,
              url: blob.url,
            }),
          })
          const json = (await res.json().catch(() => ({}))) as {
            document?: UploadedDoc
            error?: string
          }
          if (!res.ok || !json.document) {
            const reason = json.error ?? `Upload failed (${res.status})`
            setDocuments((prev) =>
              prev.map((d) =>
                d.id === tempId ? { ...d, status: "error", error: reason } : d
              )
            )
            if (json.error) toast.error(json.error)
            return
          }
          // Prefer the server (blob) url; fall back to the local preview.
          const merged = {
            ...json.document,
            url: json.document.url ?? previewUrl,
          }
          setDocuments((prev) =>
            prev.map((d) => (d.id === tempId ? merged : d))
          )
          if (previewUrl && merged.url !== previewUrl)
            URL.revokeObjectURL(previewUrl)
          if (json.document.status === "error" && json.error)
            toast.error(json.error)
        } catch (err) {
          // The refusals from the token route arrive here rather than as a
          // response — unsupported type, too large, a parent that isn't yours —
          // and each one already reads as a sentence. Showing them beats
          // flattening every failure into "Network error" the way this did when
          // the only thing that could go wrong was our own fetch.
          const reason =
            err instanceof Error && err.message ? err.message : "Network error"
          setDocuments((prev) =>
            prev.map((d) =>
              d.id === tempId ? { ...d, status: "error", error: reason } : d
            )
          )
          toast.error(`Couldn't upload ${file.name}`)
        }
      }
      await Promise.all(list.map(uploadOne))
    },
    [projectId, currentChatId]
  )

  /** Re-run a failed upload from the File the chip is still holding. */
  const retryUpload = useCallback(
    (id: string) => {
      const doc = documentsRef.current.find((d) => d.id === id)
      if (!doc?.file) return
      void uploadFiles([doc.file])
    },
    [uploadFiles]
  )

  const removeDocument = useCallback(async (id: string) => {
    let removed: UploadedDoc | undefined
    setDocuments((prev) => {
      removed = prev.find((d) => d.id === id)
      return prev.filter((d) => d.id !== id)
    })
    // Object URLs are only ever minted for local previews, and nothing else
    // holds this one once the chip is gone.
    if (removed?.url?.startsWith("blob:")) URL.revokeObjectURL(removed.url)
    if (id.startsWith("tmp-")) return
    // The chip is already gone from the composer and putting it back would be
    // more confusing than the toast; say so and leave the row for the
    // documents list to reconcile.
    await mutateOrToast(`/api/documents/${id}`, {
      method: "DELETE",
      errorMessage: "Couldn't remove that attachment from your documents.",
    })
  }, [])

  /**
   * Hand the staged, ready attachments to the message being sent: clear the
   * composer, show them on that turn optimistically, and bind them server-side
   * to the chat and turn index. Returns what rode along, for the caller to turn
   * into message parts.
   */
  const attachToTurn = useCallback(
    (turnIndex: number): UploadedDoc[] => {
      const attached = documents.filter((d) => d.status === "ready")
      if (attached.length === 0) return []
      // Only the docs that actually rode along leave the composer. Clearing the
      // whole list would silently discard an upload still in flight and any
      // failed one the user has yet to retry.
      setDocuments((prev) => prev.filter((d) => d.status !== "ready"))
      setAttachmentsByTurn((prev) => ({ ...prev, [turnIndex]: attached }))
      return attached
    },
    [documents]
  )

  /** Persist the binding once the chat row is guaranteed to exist. */
  const persistTurnBinding = useCallback(
    (attached: readonly UploadedDoc[], turnIndex: number) => {
      const id = currentChatId()
      if (attached.length === 0 || !id) return
      // A failed binding means the attachments render on this turn now but not
      // after a reload — worth telling the reader, since re-attaching is the
      // only fix and nothing else would reveal it.
      void mutateOrToast("/api/documents", {
        method: "PATCH",
        body: {
          ids: attached.map((d) => d.id),
          chatId: id,
          messageIndex: turnIndex,
        },
        errorMessage:
          "Attachments may not stay on this message after a reload.",
      })
    },
    [currentChatId]
  )

  return {
    documents,
    attachmentsByTurn,
    /** True while any staged file is still uploading — the composer holds send. */
    uploading: documents.some((d) => d.status === "processing"),
    uploadFiles,
    retryUpload,
    removeDocument,
    attachToTurn,
    persistTurnBinding,
  }
}
