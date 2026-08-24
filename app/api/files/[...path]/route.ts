import { promises as fs } from "node:fs"
import path from "node:path"
import { NextResponse } from "next/server"

import {
  attachmentContentDisposition,
  documentMediaType,
} from "@/lib/document-files"

// Serves files stored by lib/local-blob (the self-hosted replacement for
// Vercel Blob). Names carry a random suffix, so URLs are unguessable; this
// route requires no extra auth on top of the app's same-origin page.
const rootDir = () => process.env.LOCAL_STORAGE_DIR ?? "/data/uploads"

const MIME: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".txt": "text/plain",
  ".md": "text/markdown",
  ".csv": "text/csv",
  ".json": "application/json",
  ".html": "text/html",
}

export async function GET(
  request: Request,
  ctx: { params: Promise<{ path: string[] }> }
) {
  const { path: segments } = await ctx.params
  const root = path.resolve(rootDir())
  const abs = path.resolve(root, segments.join("/"))
  if (!abs.startsWith(root + path.sep)) {
    return new NextResponse("Forbidden", { status: 403 })
  }
  try {
    const buf = await fs.readFile(abs)
    const documentType = documentMediaType(abs)
    const mime =
      documentType ??
      MIME[path.extname(abs).toLowerCase()] ??
      "application/octet-stream"
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "content-type": mime,
        "cache-control": "private, max-age=3600",
        "x-content-type-options": "nosniff",
        ...(documentType && documentType !== "application/pdf"
          ? {
              "content-disposition": attachmentContentDisposition(
                new URL(request.url).searchParams.get("filename") ??
                  path.basename(abs)
              ),
            }
          : {}),
      },
    })
  } catch {
    return new NextResponse("Not found", { status: 404 })
  }
}
