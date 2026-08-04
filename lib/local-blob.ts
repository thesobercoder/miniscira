// Self-hosted replacement for @vercel/blob: uploaded files land on a local
// volume and are served by the /api/files route. Same put/del surface the app
// used before, so call sites only changed their import.

import { promises as fs } from "node:fs"
import path from "node:path"
import crypto from "node:crypto"

import { appBaseUrl } from "@/lib/base-url"

const rootDir = () => process.env.LOCAL_STORAGE_DIR ?? "/data/uploads"

type BlobPutOptions = {
  access?: "public" | "private"
  addRandomSuffix?: boolean
  contentType?: string
}

export async function put(
  name: string,
  data: ArrayBuffer | Uint8Array | Buffer,
  options: BlobPutOptions = {}
): Promise<{ url: string; contentType?: string }> {
  // `name` can contain attacker-controlled path segments; flatten to a leaf so
  // one upload can never escape the storage root or overwrite another.
  const leaf = path.basename(name).replace(/[/\\]/g, "_").slice(-200) || "upload"
  const stored = options.addRandomSuffix
    ? `${Date.now()}-${crypto.randomUUID()}-${leaf}`
    : leaf
  const abs = path.join(rootDir(), stored)
  await fs.mkdir(path.dirname(abs), { recursive: true })
  await fs.writeFile(abs, Buffer.from(data as Uint8Array))
  return {
    url: `${appBaseUrl()}/api/files/${stored}`,
    contentType: options.contentType,
  }
}

export async function del(url: string): Promise<void> {
  try {
    const leaf = decodeURIComponent(url.split("/").pop() ?? "")
    if (leaf) await fs.unlink(path.join(rootDir(), leaf))
  } catch {
    // Already gone or a foreign URL — deletion is best-effort.
  }
}
