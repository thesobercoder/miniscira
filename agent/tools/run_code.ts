import { and, eq, inArray } from "drizzle-orm"
import { defineTool } from "eve/tools"
import { z } from "zod"
import { db } from "@/lib/db"
import { document } from "@/lib/db/schema"
import {
  changedDocumentFiles,
  DOCUMENT_MEDIA_TYPES,
  type DocumentFileState,
  documentMediaType,
  type GeneratedDocumentFile,
  MAX_GENERATED_DOCUMENT_BYTES,
  type SupportedDocumentMediaType,
} from "@/lib/document-files"
import { put } from "@/lib/local-blob"

// The model sees this tool as `run_code`. It runs a Python script in the
// deployment's sibling Docker sandbox and publishes supported generated files.
const IMAGE_RE = /\.(png|jpe?g|svg|gif|webp)$/i

export default defineTool({
  description:
    "Run a Python script in a secure, offline sandbox for calculations, statistics, data analysis, and document creation. pandas, numpy, and matplotlib are preinstalled; there is NO internet access. To analyze or edit the user's uploaded files, pass their exact filenames in `files` — each is placed in the working directory to open by name (e.g. pd.read_csv('sales.csv')). print() the results you want back. Save charts as PNG, JPEG, SVG, GIF, or WebP for inline display. Newly created PDF, DOCX, PPTX, and XLSX files are returned as downloads. Use this for code-driven work, not prose or web research.",
  inputSchema: z.object({
    code: z
      .string()
      .min(1)
      .describe(
        "The Python script to run. The working directory holds any requested files; print the results you want returned to stdout."
      ),
    title: z
      .string()
      .optional()
      .describe("A short label for what this script does, shown in the UI."),
    files: z
      .array(z.string())
      .optional()
      .describe(
        "Exact filenames of the user's uploaded documents to load into the working directory before running (e.g. ['sales.csv'])."
      ),
  }),
  outputSchema: z.object({
    title: z.string().optional(),
    code: z.string(),
    stdout: z.string(),
    stderr: z.string(),
    exitCode: z.number(),
    ok: z.boolean(),
    images: z.array(z.object({ name: z.string(), url: z.string() })),
    files: z.array(
      z.object({
        name: z.string(),
        url: z.string(),
        mediaType: z.enum(
          Object.values(DOCUMENT_MEDIA_TYPES) as [
            SupportedDocumentMediaType,
            ...SupportedDocumentMediaType[],
          ]
        ),
        size: z.number().int().nonnegative(),
      })
    ),
    loadedFiles: z.array(z.string()).optional(),
    missingFiles: z.array(z.string()).optional(),
  }),
  async execute({ code, title, files }, ctx) {
    const auth = ctx.session.auth.current
    const sandbox = await ctx.getSandbox()

    const listWorkspaceFiles = async (): Promise<string[]> => {
      try {
        const res = await sandbox.run({
          command: "ls -1 /workspace 2>/dev/null",
        })
        return res.stdout
          .split("\n")
          .map((s) => s.trim())
          .filter(Boolean)
      } catch {
        return []
      }
    }

    const listImages = async (): Promise<string[]> =>
      (await listWorkspaceFiles()).filter((name) => IMAGE_RE.test(name))

    const listDocuments = async (): Promise<DocumentFileState[]> => {
      try {
        const result = await sandbox.run({
          command:
            'python3 -c \'import json,os; print(json.dumps([{"name":n,"size":(s:=os.stat(n)).st_size,"modifiedNanoseconds":s.st_mtime_ns} for n in os.listdir("/workspace") if os.path.isfile(n)]))\'',
        })
        const files = JSON.parse(result.stdout) as DocumentFileState[]
        return files.filter((file) => documentMediaType(file.name))
      } catch {
        return []
      }
    }

    // Stage requested uploads into the working directory by filename, scoped to
    // the signed-in user. Anything not found is reported back, not fatal.
    const loadedFiles: string[] = []
    const missingFiles: string[] = []
    if (files?.length) {
      if (auth?.principalType === "user" && auth.principalId) {
        const rows = await db
          .select({ filename: document.filename, blobUrl: document.blobUrl })
          .from(document)
          .where(
            and(
              eq(document.userId, auth.principalId),
              inArray(document.filename, files)
            )
          )
        const byName = new Map(rows.map((r) => [r.filename, r.blobUrl]))
        for (const name of files) {
          const url = byName.get(name)
          if (!url) {
            missingFiles.push(name)
            continue
          }
          try {
            // Local-blob URLs carry the public origin; fetch over loopback
            // instead — the hostname doesn't resolve inside this container.
            const localUrl = url.replace(
              /^https?:\/\/[^/]+/,
              "http://127.0.0.1:3000"
            )
            const res = await fetch(localUrl)
            if (!res.ok) throw new Error(`HTTP ${res.status}`)
            const bytes = new Uint8Array(await res.arrayBuffer())
            await sandbox.writeBinaryFile({ path: name, content: bytes })
            loadedFiles.push(name)
          } catch {
            missingFiles.push(name)
          }
        }
      } else {
        missingFiles.push(...files)
      }
    }

    // Snapshot existing outputs so we only return ones this run creates.
    const before = new Set(await listImages())
    const documentsBefore = await listDocuments()

    await sandbox.writeTextFile({ path: "main.py", content: code })
    const run = await sandbox.run({ command: "python3 main.py" })

    // Upload any newly-created charts so the UI can show them inline.
    const images: { name: string; url: string }[] = []
    for (const name of await listImages()) {
      if (before.has(name)) continue
      try {
        const bytes = await sandbox.readBinaryFile({ path: name })
        if (!bytes) continue
        const blob = await put(
          `runcode/${Date.now()}-${name}`,
          Buffer.from(bytes),
          {
            addRandomSuffix: true,
          }
        )
        images.push({ name, url: blob.url })
      } catch {
        // A chart that fails to upload just doesn't render; the run still stands.
      }
    }

    const generatedFiles: GeneratedDocumentFile[] = []
    let generatedBytes = 0
    for (const file of changedDocumentFiles(
      documentsBefore,
      await listDocuments()
    ).slice(0, 20)) {
      const { name, size } = file
      const mediaType = documentMediaType(name)
      if (!mediaType) continue
      if (
        size > MAX_GENERATED_DOCUMENT_BYTES ||
        generatedBytes + size > MAX_GENERATED_DOCUMENT_BYTES
      ) {
        continue
      }
      try {
        const bytes = await sandbox.readBinaryFile({ path: name })
        if (!bytes) continue
        const blob = await put(
          `runcode/${Date.now()}-${name}`,
          Buffer.from(bytes),
          {
            addRandomSuffix: true,
            contentType: mediaType,
          }
        )
        generatedBytes += size
        generatedFiles.push({
          name,
          url: `${blob.url}?filename=${encodeURIComponent(name)}`,
          mediaType,
          size,
        })
      } catch {
        // A generated file that fails to upload is omitted; the run result stays usable.
      }
    }

    return {
      title,
      code,
      stdout: run.stdout,
      stderr: run.stderr,
      exitCode: run.exitCode,
      ok: run.exitCode === 0,
      images,
      files: generatedFiles,
      ...(loadedFiles.length ? { loadedFiles } : {}),
      ...(missingFiles.length ? { missingFiles } : {}),
    }
  },
})
