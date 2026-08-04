"use client"

import {
  RiArrowRightUpLine,
  RiBracesLine,
  RiCheckLine,
  RiCloseLine,
  RiCodeSSlashLine,
  RiDownload2Line,
  RiExternalLinkLine,
  RiFileTextLine,
  RiLayout2Line,
} from "@remixicon/react"
import dynamic from "next/dynamic"
// biome-ignore lint/style/noRestrictedImports: re-highlights when code/language change — see the effect below
import { createElement, useEffect, useRef, useState } from "react"
import type { Highlighter } from "shiki"
import { Markdown } from "@/components/markdown"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

const GenUiPreview = dynamic(
  () => import("./genui-preview").then((m) => m.GenUiPreview),
  {
    ssr: false,
    loading: () => <PanelSkeleton label="Loading UI…" />,
  }
)

export type PanelArtifact = {
  id: string
  title: string
  language: string
  content: string
}

type PreviewKind = "html" | "markdown" | "svg" | "genui"

function previewKind(language: string): PreviewKind | null {
  if (language === "html") return "html"
  if (language === "markdown" || language === "md") return "markdown"
  if (language === "svg") return "svg"
  if (
    language === "genui" ||
    language === "openui" ||
    language === "openui-lang"
  )
    return "genui"
  return null
}

/* --------------------------- shiki code highlight -------------------------- */

// Shiki languages we preload — everything else falls back to plain text.
const SHIKI_LANGS = [
  "html",
  "xml",
  "css",
  "javascript",
  "typescript",
  "tsx",
  "jsx",
  "json",
  "python",
  "yaml",
  "sql",
  "bash",
  "markdown",
  "go",
  "rust",
]

const LANG_ALIAS: Record<string, string> = {
  svg: "xml",
  md: "markdown",
  js: "javascript",
  ts: "typescript",
  py: "python",
  yml: "yaml",
  sh: "bash",
  shell: "bash",
  rs: "rust",
}

function shikiLang(language: string): string {
  const l = LANG_ALIAS[language] ?? language
  return SHIKI_LANGS.includes(l) ? l : "text"
}

let highlighterPromise: Promise<Highlighter> | null = null
function getHighlighter() {
  if (!highlighterPromise) {
    highlighterPromise = import("shiki").then((s) =>
      s.createHighlighter({
        themes: ["github-dark", "github-light"],
        langs: SHIKI_LANGS,
      })
    )
  }
  return highlighterPromise
}

function CodeView({ code, language }: { code: string; language: string }) {
  const [html, setHtml] = useState<string | null>(null)
  const ref = useRef(0)

  useEffect(() => {
    const token = ++ref.current
    let dark = true
    try {
      dark = document.documentElement.classList.contains("dark")
    } catch {}
    getHighlighter()
      .then((hl) => {
        if (token !== ref.current) return
        setHtml(
          hl.codeToHtml(code, {
            lang: shikiLang(language),
            theme: dark ? "github-dark" : "github-light",
          })
        )
      })
      .catch(() => token === ref.current && setHtml(null))
  }, [code, language])

  if (html) {
    return (
      <div
        className="shiki-code h-full overflow-auto p-4 text-[13px] leading-relaxed"
        // Shiki emits a sanitized, self-contained <pre> — no user HTML reaches here.
        // biome-ignore lint/security/noDangerouslySetInnerHtml: Shiki-generated markup only
        dangerouslySetInnerHTML={{ __html: html }}
      />
    )
  }
  return (
    <pre className="h-full overflow-auto whitespace-pre p-4 font-mono text-[13px] text-foreground leading-relaxed">
      {code}
    </pre>
  )
}

/* -------------------------------- previews -------------------------------- */

function PanelSkeleton({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="grid h-full place-items-center text-muted-foreground text-xs">
      {label}
    </div>
  )
}

function IframePreview({
  srcDoc,
  allowScripts,
}: {
  srcDoc: string
  allowScripts?: boolean
}) {
  return (
    <iframe
      title="Artifact preview"
      srcDoc={srcDoc}
      sandbox={allowScripts ? "allow-scripts" : ""}
      className="h-full w-full border-0 bg-white"
    />
  )
}

function Preview({ kind, content }: { kind: PreviewKind; content: string }) {
  if (kind === "html") return <IframePreview srcDoc={content} allowScripts />
  if (kind === "svg")
    return (
      <IframePreview
        srcDoc={`<!doctype html><meta charset=utf8><style>html,body{margin:0;height:100%;display:grid;place-items:center;background:#fff}svg{max-width:100%;max-height:100%}</style>${content}`}
      />
    )
  if (kind === "genui")
    return (
      <div className="h-full overflow-auto p-4">
        <GenUiPreview content={content} />
      </div>
    )
  return (
    <div className="h-full overflow-auto p-5">
      <Markdown>{content}</Markdown>
    </div>
  )
}

/* ------------------------------ file helpers ------------------------------ */

const EXT: Record<string, string> = {
  html: "html",
  markdown: "md",
  md: "md",
  svg: "svg",
  genui: "openui",
  css: "css",
  javascript: "js",
  typescript: "ts",
  tsx: "tsx",
  jsx: "jsx",
  python: "py",
  json: "json",
  yaml: "yaml",
  sql: "sql",
  bash: "sh",
  shell: "sh",
  go: "go",
  rust: "rs",
}

function filenameFor(title: string, language: string): string {
  const t = title.trim()
  if (/\.[a-z0-9]{1,6}$/i.test(t)) return t
  const slug =
    t
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "artifact"
  return `${slug}.${EXT[language] ?? "txt"}`
}

function iconFor(language: string) {
  const kind = previewKind(language)
  if (kind === "html" || kind === "genui") return RiLayout2Line
  if (kind === "markdown") return RiFileTextLine
  if (language === "json" || language === "yaml") return RiBracesLine
  return RiCodeSSlashLine
}

/* -------------------------------- the chip -------------------------------- */

// Compact, single-line reference in the chat. Opens the artifact in the panel —
// no card-in-a-card, no preview inline.
export function ArtifactChip({
  artifact,
  active,
  onOpen,
}: {
  artifact: PanelArtifact
  active?: boolean
  onOpen: () => void
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        "group my-2 flex w-full max-w-md items-center gap-3 rounded-xl border p-2.5 text-left transition-colors",
        active ? "border-primary/50 bg-accent" : "bg-card hover:bg-accent"
      )}
    >
      <span
        className={cn(
          "grid size-9 shrink-0 place-items-center rounded-lg",
          active
            ? "bg-primary/15 text-primary-strong"
            : "bg-muted text-muted-foreground"
        )}
      >
        {createElement(iconFor(artifact.language), { className: "size-4.5" })}
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="truncate font-medium text-sm">{artifact.title}</span>
        <span className="truncate text-muted-foreground text-xs">
          {artifact.language} · {active ? "Open in panel" : "Click to open"}
        </span>
      </span>
      <RiArrowRightUpLine className="ml-auto size-4 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground" />
    </button>
  )
}

/* ------------------------------- the panel -------------------------------- */

function CopyButton({ content }: { content: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label={copied ? "Copied" : "Copy"}
      onClick={() => {
        void navigator.clipboard.writeText(content).then(() => {
          setCopied(true)
          setTimeout(() => setCopied(false), 1600)
        })
      }}
      className="rounded-md text-muted-foreground hover:text-foreground"
    >
      <span className="relative size-4">
        <RiCheckLine
          className={cn(
            "absolute inset-0 size-4 text-primary-strong transition-[opacity,scale] duration-150",
            copied ? "scale-100 opacity-100" : "scale-50 opacity-0"
          )}
        />
        <RiCodeSSlashLine
          className={cn(
            "absolute inset-0 size-4 transition-[opacity,scale] duration-150",
            copied ? "scale-50 opacity-0" : "scale-100 opacity-100"
          )}
        />
      </span>
    </Button>
  )
}

// A browsable, VSCode-style artifact panel: editor tabs across the top for every
// artifact in the conversation, a preview/code toggle, and the viewer below.
export function ArtifactPanel({
  artifacts,
  activeId,
  onSelect,
  onClose,
}: {
  artifacts: PanelArtifact[]
  activeId: string
  onSelect: (id: string) => void
  onClose: () => void
}) {
  const active = artifacts.find((a) => a.id === activeId) ?? artifacts[0]
  const kind = active ? previewKind(active.language) : null
  const [tab, setTab] = useState<"preview" | "code">(kind ? "preview" : "code")

  // Switching artifacts resets the view to a valid tab — done during render (not
  // an effect) so there's no flash of the wrong tab. React's supported pattern.
  const [seenId, setSeenId] = useState(activeId)
  if (activeId !== seenId) {
    setSeenId(activeId)
    setTab(kind ? "preview" : "code")
  }

  if (!active) return null

  function download() {
    const blob = new Blob([active.content], {
      type: "text/plain;charset=utf-8",
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = filenameFor(active.title, active.language)
    a.click()
    URL.revokeObjectURL(url)
  }

  function openInTab() {
    const blob = new Blob([active.content], {
      type: "text/html;charset=utf-8",
    })
    const url = URL.createObjectURL(blob)
    window.open(url, "_blank", "noopener")
    setTimeout(() => URL.revokeObjectURL(url), 60_000)
  }

  return (
    <aside className="flex h-full w-full shrink-0 flex-col border-l bg-card sm:w-[46%] sm:min-w-96 sm:max-w-3xl">
      {/* Editor tab strip — one tab per artifact, plus the close button. */}
      <div className="flex items-center border-b">
        <div className="scrollbar-none flex min-w-0 flex-1 items-stretch overflow-x-auto">
          {artifacts.map((a) => {
            const on = a.id === active.id
            return (
              <button
                key={a.id}
                type="button"
                onClick={() => onSelect(a.id)}
                title={a.title}
                className={cn(
                  "flex shrink-0 items-center gap-1.5 border-r px-3 py-2 text-xs transition-colors",
                  // Only ration width once tabs actually compete for it — a lone
                  // artifact shouldn't be clipped while the strip sits half empty.
                  artifacts.length > 1 ? "max-w-44" : "max-w-full",
                  on
                    ? "-mb-px border-b-2 border-b-primary bg-background text-foreground"
                    : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                )}
              >
                {createElement(iconFor(a.language), {
                  className: "size-3.5 shrink-0",
                })}
                <span className="truncate">{a.title}</span>
              </button>
            )
          })}
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Close panel"
          onClick={onClose}
          className="m-1 rounded-md text-muted-foreground hover:text-foreground"
        >
          <RiCloseLine className="size-4.5" />
        </Button>
      </div>

      {/* Toolbar: preview/code toggle + actions. */}
      <div className="flex items-center gap-2 border-b px-3 py-1.5">
        <span className="inline-flex h-7 shrink-0 items-center rounded-lg border bg-muted/50 px-2 font-medium font-mono text-[10px] text-muted-foreground uppercase tracking-wider">
          {active.language}
        </span>
        {kind && (
          // Matches the segmented styling of ui/tabs.tsx, sized to the h-7
          // toolbar rhythm so the badge, toggle, and icon buttons all line up.
          <div className="inline-flex h-7 items-center rounded-lg bg-muted p-[3px]">
            {(["preview", "code"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                aria-pressed={tab === t}
                className={cn(
                  "inline-flex h-full items-center rounded-md border border-transparent px-2.5 font-medium text-xs capitalize transition focus-visible:border-ring focus-visible:outline-1 focus-visible:outline-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
                  tab === t
                    ? "bg-background text-foreground shadow-sm dark:border-input dark:bg-input/30"
                    : "text-foreground/60 hover:text-foreground dark:text-muted-foreground dark:hover:text-foreground"
                )}
              >
                {t}
              </button>
            ))}
          </div>
        )}
        <div className="ml-auto flex items-center gap-0.5">
          <CopyButton content={active.content} />
          {kind === "html" && (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Open in new tab"
              onClick={openInTab}
              className="rounded-md text-muted-foreground hover:text-foreground"
            >
              <RiExternalLinkLine className="size-4" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Download file"
            onClick={download}
            className="rounded-md text-muted-foreground hover:text-foreground"
          >
            <RiDownload2Line className="size-4" />
          </Button>
        </div>
      </div>

      {/* Viewer */}
      <div className="min-h-0 flex-1">
        {kind && tab === "preview" ? (
          <Preview kind={kind} content={active.content} />
        ) : (
          <CodeView code={active.content} language={active.language} />
        )}
      </div>
    </aside>
  )
}
