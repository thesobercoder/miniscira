export const DOCUMENT_MEDIA_TYPES = {
  ".pdf": "application/pdf",
  ".docx":
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".pptx":
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
} as const

export type SupportedDocumentExtension = keyof typeof DOCUMENT_MEDIA_TYPES
export type SupportedDocumentMediaType =
  (typeof DOCUMENT_MEDIA_TYPES)[SupportedDocumentExtension]

export type GeneratedDocumentFile = {
  name: string
  url: string
  mediaType: SupportedDocumentMediaType
  size: number
}

export type DocumentFileState = {
  name: string
  size: number
  modifiedNanoseconds: number
}

export const MAX_GENERATED_DOCUMENT_BYTES = 50 * 1024 * 1024

export function changedDocumentFiles(
  before: readonly DocumentFileState[],
  after: readonly DocumentFileState[]
): DocumentFileState[] {
  const prior = new Map(before.map((file) => [file.name, file]))
  return after.filter((file) => {
    const previous = prior.get(file.name)
    return (
      documentMediaType(file.name) != null &&
      (previous == null ||
        previous.size !== file.size ||
        previous.modifiedNanoseconds !== file.modifiedNanoseconds)
    )
  })
}

export function documentExtension(
  filename: string
): SupportedDocumentExtension | undefined {
  const dot = filename.lastIndexOf(".")
  if (dot < 0) return undefined
  const extension = filename.slice(dot).toLowerCase()
  return Object.hasOwn(DOCUMENT_MEDIA_TYPES, extension)
    ? (extension as SupportedDocumentExtension)
    : undefined
}

export function documentMediaType(
  filename: string
): SupportedDocumentMediaType | undefined {
  const extension = documentExtension(filename)
  return extension ? DOCUMENT_MEDIA_TYPES[extension] : undefined
}

export function attachmentContentDisposition(filename: string): string {
  const leaf = filename.split(/[/\\]/).pop() || "download"
  const ascii = leaf
    .replace(/[^\x20-\x7e]/g, "_")
    .replace(/["\\]/g, "_")
    .trim()
  return `attachment; filename="${ascii || "download"}"`
}

export function storedDocumentMimeType(
  mimeType: string,
  filename: string
): SupportedDocumentMediaType | undefined {
  const fromName = documentMediaType(filename)
  if (fromName) return fromName
  return Object.values(DOCUMENT_MEDIA_TYPES).find(
    (supported) => supported === mimeType
  )
}
