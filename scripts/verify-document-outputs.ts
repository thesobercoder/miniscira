/**
 * Format-aware content assertions for the production document-proof files.
 *
 * Reads `.eve/document-files-production-proof.json` (URL paths written by
 * `document-files-production-acceptance`), downloads each file from the
 * production target, and asserts real fixture content:
 *
 * - PDF via unpdf text layer
 * - DOCX / PPTX / XLSX via OOXML zip members
 * - edited DOCX must contain the replacement and not the original phrase
 */
import { readFileSync } from "node:fs"
import { extractText, getDocumentProxy } from "unpdf"

const target = process.env.MINISCIRA_DOC_CHECK_TARGET ?? "http://127.0.0.1:8325"
const phrase = "MiniScira production proof"

const failures: string[] = []
async function download(path: string): Promise<Buffer> {
  const response = await fetch(new URL(path, target))
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`)
  return Buffer.from(await response.arrayBuffer())
}

function ooxmlText(buffer: Buffer, memberPattern: RegExp): string {
  const start = buffer.readUInt32LE(0)
  if (start !== 0x04034b50) throw new Error("not a zip archive")
  // Minimal central-directory scan: find member headers and inflate raw parts.
  // Bun ships zlib; each local file header carries its own compressed payload.
  return ""
}

// zipfile parsing without a dependency: use the Python-free approach —
// Bun exposes node:zlib; but a full zip reader is error-prone. Instead shell
// out to python3 zipfile, present on this host.
import { execFileSync } from "node:child_process"
import { mkdtempSync, writeFileSync as writeTmp } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

function ooxmlMemberText(buffer: Buffer, memberSubstring: string): string {
  const dir = mkdtempSync(join(tmpdir(), "doccheck-"))
  const file = join(dir, "input")
  writeTmp(file, buffer)
  const script = [
    "import zipfile, re, sys",
    "z = zipfile.ZipFile(sys.argv[1])",
    "out = []",
    "for name in z.namelist():",
    "    if sys.argv[2] not in name or not name.endswith('.xml'): continue",
    "    data = z.read(name)",
    "    out.append(re.sub(rb'<[^>]+>', b'', data).decode('utf-8','replace'))",
    "print('\\n'.join(out))",
  ].join("\n")
  try {
    return execFileSync("python3", ["-c", script, file, memberSubstring], {
      encoding: "utf8",
      maxBuffer: 16 * 1024 * 1024,
    })
  } finally {
    rmDir(dir)
  }
}

import { rmSync } from "node:fs"
function rmDir(dir: string) {
  try {
    rmSync(dir, { recursive: true, force: true })
  } catch {}
}

async function checkPdf(path: string) {
  const buffer = await download(path)
  const pdf = await getDocumentProxy(new Uint8Array(buffer))
  const { text } = await extractText(pdf, { mergePages: true })
  const body = Array.isArray(text) ? text.join("\n") : text
  if (!body.includes(phrase))
    failures.push(`pdf: missing "${phrase}" in extracted text`)
}

async function checkOoxml(
  path: string,
  memberPattern: RegExp,
  expect: string[],
  forbid: string[] = []
) {
  const buffer = await download(path)
  const text = ooxmlMemberText(buffer, memberPattern)
  for (const needle of expect)
    if (!text.includes(needle)) failures.push(`${path}: missing "${needle}"`)
  for (const needle of forbid)
    if (text.includes(needle)) failures.push(`${path}: still contains "${needle}"`)
}

const paths: string[] = JSON.parse(
  readFileSync(".eve/document-files-production-proof.json", "utf8")
)

await checkPdf(paths[0])
await checkOoxml(paths[1], "word/document", [phrase])
await checkOoxml(paths[2], "ppt/slides/slide", [phrase])
await checkOoxml(paths[3], "xl/", [phrase])
await checkOoxml(paths[4], "word/document", [
  "Edited by MiniScira production",
], ["Original production edit fixture"])

if (failures.length > 0) {
  console.error("FAILED:\n" + failures.map((f) => `- ${f}`).join("\n"))
  process.exit(1)
}
console.log(`OK: all content assertions passed for ${paths.length} files`)
