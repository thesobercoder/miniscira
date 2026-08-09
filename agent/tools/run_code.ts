import { and, eq, inArray } from "drizzle-orm"
import { defineTool } from "eve/tools"
import { z } from "zod"
import { db } from "@/lib/db"
import { document } from "@/lib/db/schema"
import { put } from "@/lib/local-blob"

// The model sees this tool as `run_code`. It runs a Python script in the
// agent's sandbox — a sibling Docker container with allowlisted package/source
// egress on this deployment (see agent/sandbox.ts) — for data analysis over the
// user's uploaded files — and returns stdout/stderr plus any charts it saved.
// The sandbox image has pandas / numpy / matplotlib preinstalled. Paths resolve
// from /workspace, so a bare
// filename addresses the working directory. Renders in the timeline as a code
// cell with its output and any generated plots.
const IMAGE_RE = /\.(png|jpe?g|svg|gif|webp)$/i

export default defineTool({
  description:
    "Run a Python script in a secure, offline sandbox for calculations, statistics, and data analysis. pandas, numpy, and matplotlib are preinstalled; there is NO internet access. To analyze the user's uploaded files, pass their exact filenames in `files` — each is placed in the working directory to open by name (e.g. pd.read_csv('sales.csv')). print() the results you want back. Save any chart with plt.savefig('chart.png') and it is returned as a viewable image. Use this for math and data work — not for prose (write Markdown) or web research (use the search tools).",
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
  async execute({ code, title, files }, ctx) {
    const auth = ctx.session.auth.current
    const sandbox = await ctx.getSandbox()

    const listImages = async (): Promise<string[]> => {
      try {
        const res = await sandbox.run({
          command: "ls -1 /workspace 2>/dev/null",
        })
        return res.stdout
          .split("\n")
          .map((s) => s.trim())
          .filter((n) => IMAGE_RE.test(n))
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

    // Snapshot existing charts so we only return ones this run creates.
    const before = new Set(await listImages())

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

    return {
      title,
      code,
      stdout: run.stdout,
      stderr: run.stderr,
      exitCode: run.exitCode,
      ok: run.exitCode === 0,
      images,
      ...(loadedFiles.length ? { loadedFiles } : {}),
      ...(missingFiles.length ? { missingFiles } : {}),
    }
  },
})
