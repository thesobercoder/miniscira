"use client"

import { RiGitBranchLine } from "@remixicon/react"
import type { ComponentProps } from "react"

import { cn } from "@/lib/utils"

// AIcss File Diff (aicss.dev/components/file-diff), translated from its
// CSS-module demo into our Tailwind idiom: an inline diff card with a filename
// header, +/- stat counts, and added/deleted/context rows carrying old & new
// line numbers. Data-driven so an agent tool can hand it real edits.
type DiffRowType = "ctx" | "add" | "del"

export type DiffRow = {
  old?: number | null
  cur?: number | null
  type: DiffRowType
  text: string
}

// Classic LCS line diff → rows carrying old & new line numbers. Used to turn a
// file-edit tool's before/after (Anthropic str_replace's old_str/new_str, or a
// created file's full text) into diff rows. Dependency-free; inputs are a single
// edit's worth of code, not whole repos.
export function diffLines(beforeText: string, afterText: string): DiffRow[] {
  const a = beforeText.replace(/\n$/, "").split("\n")
  const b = afterText.replace(/\n$/, "").split("\n")
  // A truly empty "before" is a file creation, not a one-line deletion.
  if (beforeText === "")
    return b.map((text, i) => ({
      old: null,
      cur: i + 1,
      type: "add" as const,
      text,
    }))
  const n = a.length
  const m = b.length
  const lcs: number[][] = Array.from({ length: n + 1 }, () =>
    new Array(m + 1).fill(0)
  )
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i][j] =
        a[i] === b[j]
          ? lcs[i + 1][j + 1] + 1
          : Math.max(lcs[i + 1][j], lcs[i][j + 1])
    }
  }
  const rows: DiffRow[] = []
  let i = 0
  let j = 0
  let oldLn = 1
  let newLn = 1
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      rows.push({ old: oldLn++, cur: newLn++, type: "ctx", text: a[i] })
      i++
      j++
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      rows.push({ old: oldLn++, cur: null, type: "del", text: a[i] })
      i++
    } else {
      rows.push({ old: null, cur: newLn++, type: "add", text: b[j] })
      j++
    }
  }
  while (i < n)
    rows.push({ old: oldLn++, cur: null, type: "del", text: a[i++] })
  while (j < m)
    rows.push({ old: null, cur: newLn++, type: "add", text: b[j++] })
  return rows
}

// Parse a unified / apply-patch hunk body (lines prefixed with +, -, or space)
// into diff rows, tracking line numbers across @@ headers. Best-effort: covers
// the OpenAI `apply_patch` V4A body and standard unified diffs.
export function parsePatchRows(patch: string): DiffRow[] {
  const rows: DiffRow[] = []
  let oldLn = 1
  let newLn = 1
  for (const line of patch.split("\n")) {
    if (line.startsWith("@@")) {
      // @@ -a,b +c,d @@ — reset the counters when the header carries positions.
      const m = /-(\d+)(?:,\d+)?\s+\+(\d+)/.exec(line)
      if (m) {
        oldLn = Number(m[1])
        newLn = Number(m[2])
      }
      continue
    }
    if (
      line.startsWith("---") ||
      line.startsWith("+++") ||
      line.startsWith("***")
    )
      continue
    const marker = line[0]
    const text = line.slice(1)
    if (marker === "+")
      rows.push({ old: null, cur: newLn++, type: "add", text })
    else if (marker === "-")
      rows.push({ old: oldLn++, cur: null, type: "del", text })
    else
      rows.push({
        old: oldLn++,
        cur: newLn++,
        type: "ctx",
        text: marker === " " ? text : line,
      })
  }
  return rows
}

export function FileDiff({
  file,
  rows,
  className,
  ...props
}: {
  file: string
  rows: DiffRow[]
} & ComponentProps<"div">) {
  const added = rows.filter((r) => r.type === "add").length
  const removed = rows.filter((r) => r.type === "del").length

  return (
    <div
      className={cn(
        "my-3 overflow-hidden rounded-xl border border-border bg-card",
        className
      )}
      {...props}
    >
      <div className="flex items-center justify-between gap-3 border-border border-b bg-muted/50 px-3 py-2">
        <span className="flex min-w-0 items-center gap-2">
          <RiGitBranchLine className="size-4 shrink-0 text-muted-foreground" />
          <span className="truncate font-mono text-foreground text-xs">
            {file}
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-2 font-mono text-xs">
          <span className="text-emerald-600 dark:text-emerald-400">
            +{added}
          </span>
          <span className="text-rose-600 dark:text-rose-400">-{removed}</span>
        </span>
      </div>
      <div className="overflow-x-auto py-1 font-mono text-xs leading-6">
        {rows.map((r) => (
          <div
            key={`${r.type}:${r.old ?? "-"}:${r.cur ?? "-"}`}
            className={cn(
              "flex items-stretch whitespace-pre",
              r.type === "add" && "bg-emerald-500/10",
              r.type === "del" && "bg-rose-500/10"
            )}
          >
            <span className="w-9 shrink-0 select-none px-2 text-right text-muted-foreground">
              {r.old ?? ""}
            </span>
            <span className="w-9 shrink-0 select-none px-2 text-right text-muted-foreground">
              {r.cur ?? ""}
            </span>
            <span
              className={cn(
                "w-4 shrink-0 select-none text-center",
                r.type === "add" && "text-emerald-600 dark:text-emerald-400",
                r.type === "del" && "text-rose-600 dark:text-rose-400",
                r.type === "ctx" && "text-transparent"
              )}
            >
              {r.type === "add" ? "+" : r.type === "del" ? "-" : ""}
            </span>
            <code
              className={cn(
                "flex-1 pr-3",
                r.type === "add" && "text-emerald-900 dark:text-emerald-200",
                r.type === "del" && "text-rose-900 dark:text-rose-200",
                r.type === "ctx" && "text-foreground/80"
              )}
            >
              {r.text}
            </code>
          </div>
        ))}
      </div>
    </div>
  )
}
