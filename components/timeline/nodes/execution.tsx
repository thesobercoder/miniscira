"use client"

import {
  RiArrowDownSLine,
  RiCodeSSlashLine,
  RiFileCodeLine,
  RiFileEditLine,
  type RiGlobeLine,
  RiSearch2Line,
  RiTerminalBoxLine,
} from "@remixicon/react"
import { useState } from "react"

import { ChainOfThoughtStep } from "@/components/ai-elements/chain-of-thought"
import {
  type DiffRow,
  diffLines,
  FileDiff,
  parsePatchRows,
} from "@/components/ai-elements/file-diff"
import {
  arrayField,
  basename,
  clampText,
  firstLine,
  inputOf,
  isPartDone,
  type Kind,
  outputOf,
  type ToolNodeProps,
  type ToolPart,
} from "@/components/timeline/parts"
import { Live } from "@/components/timeline/primitives"
import type { GeneratedDocumentFile } from "@/lib/document-files"
import { cn } from "@/lib/utils"

/** Steps where the agent ran something: code, shell, and file edits. */

/** Shared by every node here that shows a blob of code or output. */
export function CodeBlock({ text }: { text: string }) {
  if (!text.trim()) return null
  return (
    <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-lg border bg-muted/60 p-2.5 font-mono text-foreground text-xs leading-relaxed">
      {clampText(text)}
    </pre>
  )
}

export function DocumentLinks({ files }: { files: GeneratedDocumentFile[] }) {
  if (files.length === 0) return null
  return (
    <div className="flex flex-col gap-1.5">
      {files.map((file) => (
        <a
          key={file.url}
          href={file.url}
          download={file.name}
          className="w-fit text-sm underline underline-offset-4"
        >
          Download {file.name}
        </a>
      ))}
    </div>
  )
}

/* -------- run_code -------- */

export function RunCodeNode({ group, last, active }: ToolNodeProps) {
  const part = group.parts[0]
  const finished = isPartDone(part)
  const live = Boolean(active) && !finished
  const [open, setOpen] = useState(false)
  const input = inputOf(part)
  const code = String(input.code ?? "")
  const out = outputOf(part) as
    | {
        stdout?: string
        stderr?: string
        ok?: boolean
        images?: { name: string; url: string }[]
        files?: GeneratedDocumentFile[]
        loadedFiles?: string[]
        missingFiles?: string[]
      }
    | undefined
  const label = String(input.title ?? "") || firstLine(code) || "Python"
  const failed = finished && out?.ok === false
  const images = arrayField<{ name: string; url: string }>(
    outputOf(part),
    "images"
  )
  const stdout = out?.stdout?.trim() ? out.stdout : ""
  const stderr = out?.stderr?.trim() ? out.stderr : ""
  const files = arrayField<GeneratedDocumentFile>(outputOf(part), "files")

  return (
    <ChainOfThoughtStep
      last={last}
      icon={RiTerminalBoxLine}
      iconNode={live ? <Live /> : undefined}
      label={label}
      open={open}
      onOpenChange={setOpen}
      description={
        live
          ? "Running code…"
          : finished
            ? failed
              ? "Code failed"
              : "Ran code"
            : "Stopped before finishing"
      }
    >
      <div className="space-y-2">
        {out?.loadedFiles?.length ? (
          <div className="text-muted-foreground text-xs">
            Loaded {out.loadedFiles.join(", ")}
          </div>
        ) : null}
        <CodeBlock text={code} />
        {stdout && <CodeBlock text={stdout} />}
        {stderr && (
          <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-lg border border-destructive/30 bg-destructive/5 p-2.5 font-mono text-destructive text-xs leading-relaxed">
            {clampText(stderr)}
          </pre>
        )}
        {images.length > 0 && (
          <div className="grid grid-cols-2 gap-2">
            {images.map((img) => (
              // biome-ignore lint/performance/noImgElement: sandbox-generated chart hosted on Blob
              <img
                key={img.url}
                src={img.url}
                alt={img.name}
                className="w-full rounded-lg border bg-card"
              />
            ))}
          </div>
        )}
        <DocumentLinks files={files} />
        {out?.missingFiles?.length ? (
          <div className="text-muted-foreground text-xs">
            Couldn't find: {out.missingFiles.join(", ")}
          </div>
        ) : null}
      </div>
    </ChainOfThoughtStep>
  )
}

/* -------- file edit (provider-native str_replace / apply_patch) -------- */

// Pull a filename + diff rows out of whichever edit-tool shape the model used.
function diffFromEditPart(
  part: ToolPart
): { file: string; rows: DiffRow[] } | null {
  const input = inputOf(part)
  const file = String(
    input.path ?? input.file_path ?? input.filePath ?? input.file ?? ""
  )

  // Anthropic text editor: str_replace (old_str → new_str) or create (file_text).
  const command = input.command as string | undefined
  const oldStr = input.old_str ?? input.oldStr
  const newStr = input.new_str ?? input.newStr
  if (typeof oldStr === "string" || typeof newStr === "string") {
    return {
      file,
      rows: diffLines(String(oldStr ?? ""), String(newStr ?? "")),
    }
  }
  if (command === "create" || typeof input.file_text === "string") {
    return { file, rows: diffLines("", String(input.file_text ?? "")) }
  }
  if (command === "insert" && typeof input.insert_text === "string") {
    return { file, rows: diffLines("", String(input.insert_text)) }
  }

  // OpenAI apply_patch: a V4A / unified patch body somewhere in the input.
  const patch =
    (typeof input.patch === "string" && input.patch) ||
    (typeof input.diff === "string" && input.diff) ||
    (typeof input.input === "string" && input.input) ||
    (typeof input.operation === "string" && input.operation)
  if (patch) return { file, rows: parsePatchRows(patch) }

  return null
}

export function CodeDiffNode({ group, last, active }: ToolNodeProps) {
  const part = group.parts[0]
  const live = Boolean(active) && !isPartDone(part)
  const [open, setOpen] = useState(true)
  const diff = diffFromEditPart(part)
  const name = diff?.file ? basename(diff.file) : "file"

  return (
    <ChainOfThoughtStep
      last={last}
      icon={RiFileEditLine}
      iconNode={live ? <Live /> : undefined}
      label={`${live ? "Editing" : "Edited"} ${name}`}
      open={open}
      onOpenChange={setOpen}
    >
      {diff && diff.rows.length > 0 ? (
        <FileDiff file={diff.file || name} rows={diff.rows} />
      ) : (
        <p className="text-muted-foreground text-xs">Preparing the edit…</p>
      )}
    </ChainOfThoughtStep>
  )
}

/* -------- generic detail node (bash / file / glob / grep) -------- */

type Detail = {
  icon: typeof RiGlobeLine
  label: string
  arg: string
  code?: string
  output?: string
  meta?: string
}

function detailFor(part: ToolPart, kind: Kind, live: boolean): Detail {
  const input = inputOf(part)
  const out = outputOf(part) as Record<string, unknown> | undefined
  switch (kind) {
    case "bash":
      return {
        icon: RiTerminalBoxLine,
        label: live ? "Running command" : "Ran command",
        arg: firstLine(String(input.command ?? "")),
        code: String(input.command ?? ""),
        output: out ? String(out.stdout ?? "") || String(out.stderr ?? "") : "",
        meta:
          out && typeof out.exitCode === "number"
            ? `exit ${out.exitCode}`
            : undefined,
      }
    case "readfile":
      return {
        icon: RiFileCodeLine,
        label: "Read file",
        arg: basename(String(input.filePath ?? "")),
        output: out ? String(out.content ?? "") : "",
      }
    case "writefile":
      return {
        icon: RiFileEditLine,
        label: live ? "Writing file" : "Wrote file",
        arg: basename(String(input.filePath ?? "")),
        code: String(input.content ?? ""),
      }
    case "glob":
      return {
        icon: RiSearch2Line,
        label: "Found files",
        arg: String(input.pattern ?? ""),
        output: out ? String(out.content ?? "") : "",
      }
    default: // grep
      return {
        icon: RiCodeSSlashLine,
        label: "Searched code",
        arg: String(input.pattern ?? ""),
        output: out ? String(out.content ?? "") : "",
      }
  }
}

export function DetailNode({ group, last, active }: ToolNodeProps) {
  const part = group.parts[0]
  const live = Boolean(active) && !isPartDone(part)
  const [open, setOpen] = useState(false)
  const d = detailFor(part, group.kind, live)
  const expandable = Boolean(d.code || d.output)

  const label = expandable ? (
    <button
      type="button"
      onClick={() => setOpen((v) => !v)}
      className="flex w-full max-w-full items-center gap-1.5 text-left text-foreground transition-colors hover:text-foreground/80"
    >
      <span className="font-medium">{d.label}</span>
      {d.arg && (
        <span className="min-w-0 truncate font-mono text-muted-foreground text-xs">
          {d.arg}
        </span>
      )}
      {d.meta && (
        <span className="ml-auto shrink-0 font-mono text-[11px] text-muted-foreground">
          {d.meta}
        </span>
      )}
      <RiArrowDownSLine
        className={cn(
          "size-4 shrink-0 opacity-50 transition-transform",
          !open && "-rotate-90"
        )}
      />
    </button>
  ) : (
    <div className="flex items-center gap-1.5">
      <span className="font-medium text-foreground">{d.label}</span>
      {d.arg && (
        <span className="truncate font-mono text-muted-foreground text-xs">
          {d.arg}
        </span>
      )}
    </div>
  )

  return (
    <ChainOfThoughtStep
      last={last}
      icon={d.icon}
      iconNode={live ? <Live /> : undefined}
      label={label}
    >
      {open && (
        <>
          <CodeBlock text={d.code ?? ""} />
          {d.output && (
            <div>
              <div className="mb-1 font-medium text-[11px] text-muted-foreground">
                Output
              </div>
              <CodeBlock text={d.output} />
            </div>
          )}
        </>
      )}
    </ChainOfThoughtStep>
  )
}
