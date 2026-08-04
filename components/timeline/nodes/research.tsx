"use client"

import {
  RiFileSearchLine,
  RiFileTextLine,
  RiImageLine,
  RiLightbulbAiLine,
} from "@remixicon/react"
import { useState } from "react"

import { ChainOfThoughtStep } from "@/components/ai-elements/chain-of-thought"
import { ImageGeneration } from "@/components/ai-elements/image-generation"
import {
  collectSources,
  docResultsOf,
  firstLine,
  inputOf,
  isPartDone,
  type NodeProps,
  outputOf,
  queriesOf,
  type ReasoningGroup,
  type ToolNodeProps,
  urlsOf,
} from "@/components/timeline/parts"
import {
  Live,
  QueryBadges,
  ResultList,
  SEARCH_META,
} from "@/components/timeline/primitives"

/**
 * The gathering steps: searching, reading, thinking, and what came back.
 *
 * These moved here from `research-timeline.tsx`, which had grown into both the
 * timeline root *and* a handful of node renderers. The one node still defined
 * over there is the subagent — it renders a nested `ResearchTimeline`, so
 * moving it would make the import cycle real rather than notional.
 */

export function SearchNode({ group, last, active }: ToolNodeProps) {
  const [open, setOpen] = useState(true)
  const live = Boolean(active) && group.parts.some((p) => !isPartDone(p))
  const queries = [...new Set(group.parts.flatMap(queriesOf).filter(Boolean))]
  const results = collectSources(group.parts)
  const meta = SEARCH_META[group.kind] ?? SEARCH_META.search

  return (
    <ChainOfThoughtStep
      last={last}
      icon={meta.icon}
      iconNode={live ? <Live /> : undefined}
      label={live ? meta.live : meta.done}
      open={open}
      onOpenChange={setOpen}
    >
      <QueryBadges queries={queries} />
      {results.length > 0 && (
        <p className="text-muted-foreground text-xs">
          {live ? "Reviewing sources" : "Sources"} · {results.length}
        </p>
      )}
      <ResultList results={results} />
    </ChainOfThoughtStep>
  )
}

export function ReadNode({ group, last, active }: ToolNodeProps) {
  const [open, setOpen] = useState(false)
  const live = Boolean(active) && group.parts.some((p) => !isPartDone(p))
  const urls = [...new Set(group.parts.flatMap(urlsOf).filter(Boolean))]
  const n = urls.length

  return (
    <ChainOfThoughtStep
      last={last}
      icon={RiFileTextLine}
      iconNode={live ? <Live /> : undefined}
      label={`${live ? "Reading" : "Read"} ${n} page${n === 1 ? "" : "s"}`}
      open={open}
      onOpenChange={setOpen}
      collapsible={urls.length > 0}
    >
      {urls.length > 0 && (
        <ResultList results={urls.map((u) => ({ url: u }))} />
      )}
    </ChainOfThoughtStep>
  )
}

export function ReasoningNode({
  group,
  last,
  active,
}: NodeProps<ReasoningGroup>) {
  const [open, setOpen] = useState(false)
  const live = Boolean(active) && group.parts.some((p) => !isPartDone(p))
  const text = group.parts.map((p) => p.text).join("")
  const show = open || live
  // Narrate the thought instead of a dead "Reasoning" label — the collapsed
  // row should still tell the reader what was being figured out.
  const narrated = firstLine(text)

  return (
    <ChainOfThoughtStep
      last={last}
      icon={RiLightbulbAiLine}
      iconNode={live ? <Live /> : undefined}
      label={live ? "Thinking" : narrated || "Reasoning"}
      labelMuted={!live && Boolean(narrated)}
      open={show}
      onOpenChange={setOpen}
      collapsible={Boolean(text.trim())}
    >
      {text.trim() && (
        <div className="whitespace-pre-wrap text-muted-foreground text-xs leading-relaxed">
          {text}
        </div>
      )}
    </ChainOfThoughtStep>
  )
}

/* -------- search_documents (user knowledge base) -------- */

export function DocumentSearchNode({ group, last, active }: ToolNodeProps) {
  const [open, setOpen] = useState(false)
  const part = group.parts[0]
  const live = Boolean(active) && !isPartDone(part)
  const query = String(inputOf(part).query ?? "")
  const results = docResultsOf(part)
  const n = results.length

  // Group matches under one header per document — the reader cares about which
  // file answered, not about retrieval passages or similarity scores.
  const byFile = new Map<string, { snippets: string[]; count: number }>()
  for (const r of results) {
    const entry = byFile.get(r.filename) ?? { snippets: [], count: 0 }
    entry.count++
    if (entry.snippets.length < 3) entry.snippets.push(r.content)
    byFile.set(r.filename, entry)
  }

  return (
    <ChainOfThoughtStep
      last={last}
      icon={RiFileSearchLine}
      iconNode={live ? <Live /> : undefined}
      label={
        live
          ? "Searching your documents"
          : n === 0
            ? "No matches in your documents"
            : `Searched your documents · ${n} match${n === 1 ? "" : "es"}`
      }
      open={open}
      onOpenChange={setOpen}
    >
      {query && <QueryBadges queries={[query]} />}
      {byFile.size > 0 && (
        <div className="divide-y divide-border/60 overflow-hidden rounded-lg border bg-card/50">
          {[...byFile.entries()].map(([filename, { snippets, count }]) => (
            <div key={filename} className="space-y-1.5 px-3 py-2.5">
              <div className="flex items-center gap-1.5">
                <RiFileTextLine className="size-3.5 shrink-0 text-muted-foreground" />
                <span className="truncate font-medium text-foreground text-xs">
                  {filename}
                </span>
                <span className="ml-auto shrink-0 text-[10px] text-muted-foreground tabular-nums">
                  {count} match{count === 1 ? "" : "es"}
                </span>
              </div>
              {snippets.map((s, i) => (
                <p
                  // biome-ignore lint/suspicious/noArrayIndexKey: snippet text may repeat; list is append-only
                  key={i}
                  className="line-clamp-2 text-muted-foreground text-xs leading-relaxed"
                >
                  {s}
                </p>
              ))}
            </div>
          ))}
        </div>
      )}
    </ChainOfThoughtStep>
  )
}

/* -------- image generation -------- */

export function ImageNode({ group, last, active }: ToolNodeProps) {
  const part = group.parts[0]
  const live = Boolean(active) && !isPartDone(part)
  const prompt = String(inputOf(part).prompt ?? "")
  const out = outputOf(part) as Record<string, unknown> | undefined
  const url = typeof out?.url === "string" ? out.url : undefined
  const error = typeof out?.error === "string" ? out.error : undefined

  return (
    <ChainOfThoughtStep
      last={last}
      icon={RiImageLine}
      iconNode={live ? <Live /> : undefined}
      label={
        <span className="font-medium text-foreground">
          {live
            ? "Generating image"
            : error
              ? "Image generation failed"
              : "Generated image"}
        </span>
      }
    >
      {live || (!url && !error) ? (
        <ImageGeneration prompt={prompt} />
      ) : url ? (
        <figure className="my-1 max-w-xs">
          <a href={url} target="_blank" rel="noreferrer noopener">
            {/* biome-ignore lint/performance/noImgElement: generated blob image */}
            <img
              src={url}
              alt={prompt}
              className="w-full rounded-xl border object-cover outline outline-black/5 dark:outline-white/10"
              loading="lazy"
            />
          </a>
          {prompt && (
            <figcaption className="mt-1.5 truncate text-muted-foreground text-xs">
              &ldquo;{prompt}&rdquo;
            </figcaption>
          )}
        </figure>
      ) : (
        <p className="text-muted-foreground text-xs">{error}</p>
      )}
    </ChainOfThoughtStep>
  )
}
