"use client"

import { useCallback, useRef, useState } from "react"
import { toast } from "sonner"
import { useMountEffect } from "@/hooks/use-mount-effect"
import { mutateOrToast } from "@/lib/api-client"
import { DOCUMENT_MEDIA_TYPES } from "@/lib/document-files"
import { normalizeImage } from "@/lib/image-normalize"
import { SUPPORTED_IMAGE_EXTENSIONS } from "@/lib/image-signature"

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

export const OFFICE_MIME_TYPES = [
  DOCUMENT_MEDIA_TYPES[".docx"],
  DOCUMENT_MEDIA_TYPES[".pptx"],
  DOCUMENT_MEDIA_TYPES[".xlsx"],
] as const

const MODEL_DOCUMENT_MIME_TYPES = new Set<string>(["application/pdf"])

const IMAGE_ACCEPT_EXTENSIONS = SUPPORTED_IMAGE_EXTENSIONS.map(
  (extension) => `.${extension}`
).join(",")

export const DOC_ACCEPT = `image/*,${IMAGE_ACCEPT_EXTENSIONS},.pdf,.docx,.pptx,.xlsx,.txt,.md,.markdown,.csv,.json,.log,.tsv,.html,.xml,.yaml,.yml,text/*,application/pdf,${OFFICE_MIME_TYPES.join(",")}`

export function isModelFileAttachment(document: UploadedDoc): boolean {
  return (
    document.kind === "image" ||
    (document.mimeType != null &&
      MODEL_DOCUMENT_MIME_TYPES.has(document.mimeType))
  )
}

export function snapshotReadyAttachments(documents: readonly UploadedDoc[]) {
  const attachments = documents.filter(
    (document) => document.status === "ready"
  )
  const ids = new Set(attachments.map((document) => document.id))
  return {
    attachments,
    accept: (current: readonly UploadedDoc[]) =>
      current.filter((document) => !ids.has(document.id)),
  }
}

export async function normalizeFilesInOrder(
  files: readonly File[],
  normalize: (file: File) => Promise<File> = normalizeImage
) {
  return await Promise.all(
    files.map(async (file) => {
      try {
        return await normalize(file)
      } catch {
        return file
      }
    })
  )
}

type Options = {
  chatId?: string
  projectId?: string
  initialDocuments?: readonly UploadedDoc[]
  /** Files uploaded before a first chat existed, ready for its routed send. */
  initialStagedDocuments?: readonly UploadedDoc[]
  /** Read lazily: the chat row may not exist until the first message is sent. */
  currentChatId: () => string | undefined
}

export function useChatAttachments({
  chatId,
  projectId,
  initialDocuments = [],
  initialStagedDocuments = [],
  currentChatId,
}: Options) {
  // Staged in the composer for the next message; cleared when Eve accepts it.
  const [documents, setDocuments] = useState<UploadedDoc[]>(() =>
    initialStagedDocuments.filter((document) => document.status === "ready")
  )
  // Mirror for callbacks that must stay reference-stable: the composer is
  // memoized, so a handler that changed identity per staged file would
  // re-render it on every keystroke of an unrelated upload.
  const documentsRef = useRef(documents)
  documentsRef.current = documents
  // Every object URL created for a staged image. Removing a chip revokes its
  // URL immediately; unmount cleanup catches previews left behind on navigation.
  const previewUrlsRef = useRef(new Set<string>())
  // Sent attachments, grouped by the user-turn index they rode along with.
  const [attachmentsByTurn, setAttachmentsByTurn] = useState<
    Record<number, UploadedDoc[]>
  >(() => {
    const byTurn: Record<number, UploadedDoc[]> = {}
    for (const doc of initialDocuments) {
      if (doc.messageIndex == null) continue
      byTurn[doc.messageIndex] ??= []
      byTurn[doc.messageIndex].push(doc)
    }
    return byTurn
  })

  // Re-hydrate this chat's attachments (by turn) so they render on the right
  // message after a reload.
  // Mount-only: a different chat is a different route, which remounts this
  // component, so chatId never changes underneath us.
  useMountEffect(() => {
    if (!chatId || initialDocuments.length > 0) return
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

  useMountEffect(() => () => {
    for (const url of previewUrlsRef.current) URL.revokeObjectURL(url)
    previewUrlsRef.current.clear()
  })

  const uploadFiles = useCallback(
    async (files: FileList | File[]) => {
      const list = Array.from(files)
      if (list.length === 0) return
      const normalizedFiles = await normalizeFilesInOrder(list)
      const upload = async (normalized: File) => {
        const tempId = `tmp-${normalized.name}-${normalized.size}-${normalized.lastModified}`
        const isImage = normalized.type.startsWith("image/")
        const previewUrl = isImage ? URL.createObjectURL(normalized) : undefined
        if (previewUrl) previewUrlsRef.current.add(previewUrl)
        setDocuments((prev) => {
          const replaced = prev.find((d) => d.id === tempId)
          if (replaced?.url?.startsWith("blob:")) {
            URL.revokeObjectURL(replaced.url)
            previewUrlsRef.current.delete(replaced.url)
          }
          const next = {
            id: tempId,
            filename: normalized.name,
            status: "processing" as const,
            kind: isImage ? ("image" as const) : ("document" as const),
            url: previewUrl,
            mimeType: normalized.type,
            file: normalized,
          }
          return prev.some((document) => document.id === tempId)
            ? prev.map((document) => (document.id === tempId ? next : document))
            : [...prev, next]
        })
        const body = new FormData()
        body.set("file", normalized)
        const id = currentChatId()
        if (id) body.set("chatId", id)
        if (projectId) body.set("projectId", projectId)
        try {
          const res = await fetch("/api/documents", { method: "POST", body })
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
          if (previewUrl && merged.url !== previewUrl) {
            URL.revokeObjectURL(previewUrl)
            previewUrlsRef.current.delete(previewUrl)
          }
          if (json.document.status === "error" && json.error)
            toast.error(json.error)
        } catch {
          setDocuments((prev) =>
            prev.map((d) =>
              d.id === tempId
                ? { ...d, status: "error", error: "Network error" }
                : d
            )
          )
          toast.error(`Couldn't upload ${normalized.name}`)
        }
      }
      await Promise.all(normalizedFiles.map(upload))
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
    const removed = documentsRef.current.find((d) => d.id === id)
    setDocuments((prev) => prev.filter((d) => d.id !== id))
    // Object URLs are only ever minted for local previews, and nothing else
    // holds this one once the chip is gone.
    if (removed?.url?.startsWith("blob:")) {
      URL.revokeObjectURL(removed.url)
      previewUrlsRef.current.delete(removed.url)
    }
    if (id.startsWith("tmp-")) return
    // The chip is already gone from the composer and putting it back would be
    // more confusing than the toast; say so and leave the row for the
    // documents list to reconcile.
    await mutateOrToast(`/api/documents/${id}`, {
      method: "DELETE",
      errorMessage: "Couldn't remove that attachment from your documents.",
    })
  }, [])

  const snapshotAttachments = useCallback((turnIndex: number) => {
    const snapshot = snapshotReadyAttachments(documentsRef.current)
    let accepted = false
    return {
      attachments: snapshot.attachments,
      accept: () => {
        if (accepted) return
        accepted = true
        setDocuments((current) => snapshot.accept(current))
        if (snapshot.attachments.length > 0)
          setAttachmentsByTurn((current) => ({
            ...current,
            [turnIndex]: snapshot.attachments,
          }))
      },
    }
  }, [])

  const persistTurnBinding = useCallback(
    async (
      attached: readonly UploadedDoc[],
      turnIndex: number | null
    ) => {
      const id = currentChatId()
      if (attached.length === 0 || !id) return true
      return await mutateOrToast("/api/documents", {
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

  const rebindTurnAttachments = useCallback(
    async (attached: readonly UploadedDoc[], turnIndex: number) => {
      if (!(await persistTurnBinding(attached, turnIndex))) return false
      if (attached.length > 0)
        setAttachmentsByTurn((prev) => ({
          ...prev,
          [turnIndex]: [...attached],
        }))
      return true
    },
    [persistTurnBinding]
  )

  return {
    documents,
    attachmentsByTurn,
    /** True while any staged file is still uploading — the composer holds send. */
    uploading: documents.some((d) => d.status === "processing"),
    uploadFiles,
    retryUpload,
    removeDocument,
    snapshotAttachments,
    persistTurnBinding,
    rebindTurnAttachments,
  }
}
