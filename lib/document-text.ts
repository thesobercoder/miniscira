import { classifyPdf, processPdf } from "@firecrawl/pdf-inspector"
import { extractText, getDocumentProxy } from "unpdf"
import { storedDocumentMimeType } from "@/lib/document-files"

/**
 * Turning an uploaded file into indexable text.
 *
 * Deliberately separate from `lib/rag.ts`: this module pulls in a NATIVE addon
 * (`@firecrawl/pdf-inspector` ships a per-platform `.node` binary) and pdf.js.
 * `lib/rag.ts` is imported by `agent/tools/search_documents.ts`, and eve bundles
 * the agent with Rolldown — which cannot load a `.node` file and fails the whole
 * dev server with `UNLOADABLE_DEPENDENCY`. The agent only ever needs the
 * reranker, so extraction lives here and never enters its module graph.
 */

type SupportedKind = "office" | "pdf" | "text"

export function storedMimeType(mimeType: string, filename: string): string {
  return (
    storedDocumentMimeType(mimeType, filename) ||
    mimeType ||
    "application/octet-stream"
  )
}

/** Classify an upload: "image" → vision input, "document" → parsed & embedded, null → unsupported. */
export function attachmentKind(
  mimeType: string,
  filename: string
): "image" | "document" | null {
  const name = filename.toLowerCase()
  if (
    mimeType.startsWith("image/") ||
    /\.(png|jpe?g|webp|gif|avif|heic|bmp)$/.test(name)
  ) {
    return "image"
  }
  return kindForFile(mimeType, filename) ? "document" : null
}

function kindForFile(mimeType: string, filename: string): SupportedKind | null {
  const name = filename.toLowerCase()
  const documentType = storedDocumentMimeType(mimeType, filename)
  if (documentType && documentType !== "application/pdf") return "office"
  if (mimeType === "application/pdf" || name.endsWith(".pdf")) return "pdf"
  if (
    mimeType.startsWith("text/") ||
    /\.(txt|md|markdown|csv|json|log|rtf|tsv|html?|xml|ya?ml)$/.test(name)
  ) {
    return "text"
  }
  return null
}

/** A PDF with no text layer can't be indexed — say so instead of storing noise. */
export class ScannedPdfError extends Error {
  constructor(pages: number) {
    super(
      pages > 0
        ? `This PDF looks scanned — ${pages === 1 ? "its page has" : `all ${pages} pages have`} no text layer. Reading it would need OCR, which isn't set up here.`
        : "This PDF has no text layer. It's likely a scan or an image export."
    )
    this.name = "ScannedPdfError"
  }
}

/**
 * PDF text via pdf-inspector, falling back to unpdf.
 *
 * unpdf returns one undifferentiated blob: on the Transformer paper it produced
 * a single "paragraph", so `chunkText` — which splits on blank lines — had
 * nothing to split on and hard-sliced every 1400 chars. 29 of the 34 resulting
 * chunks began mid-word. pdf-inspector emits Markdown with headings, lists and
 * pipe-tables (18 headings and 50 table rows on the same paper), so chunks land
 * on real boundaries: 13 of 41 mid-word, and ~5x faster besides.
 *
 * It is a native module, so a platform without a prebuilt binary throws at
 * import; unpdf stays as the fallback rather than failing the upload.
 */
function pdfText(buffer: ArrayBuffer): string {
  // Copy: pdf.js transfers the ArrayBuffer it is handed, and a detached buffer
  // reaches the native side as zero bytes.
  const bytes = Buffer.from(new Uint8Array(buffer.slice(0)))
  const { pdfType, pagesNeedingOcr } = classifyPdf(bytes)
  // Scanned and ImageBased have no text layer at all. Mixed does on some pages,
  // so it still extracts — partial text beats refusing the upload.
  if (pdfType === "Scanned" || pdfType === "ImageBased")
    throw new ScannedPdfError(pagesNeedingOcr.length)
  return processPdf(bytes).markdown ?? ""
}

async function unpdfText(buffer: ArrayBuffer): Promise<string> {
  const pdf = await getDocumentProxy(new Uint8Array(buffer))
  const { text } = await extractText(pdf, { mergePages: true })
  return Array.isArray(text) ? text.join("\n\n") : text
}

/** Extract plain text from an uploaded file buffer. */
export async function extractDocumentText(
  buffer: ArrayBuffer,
  mimeType: string,
  filename: string
): Promise<string | null> {
  const kind = kindForFile(mimeType, filename)
  if (kind === "office") return null
  if (kind !== "pdf") return new TextDecoder().decode(buffer)

  try {
    const markdown = pdfText(buffer)
    if (markdown.trim()) return markdown
  } catch (err) {
    // A scanned PDF is a real answer, not a failure to retry differently.
    if (err instanceof ScannedPdfError) throw err
    console.warn("pdf-inspector failed; falling back to unpdf", err)
  }
  return await unpdfText(buffer)
}
