"use client"

import {
  RiGlobeLine,
  RiNodeTree,
  RiRedditLine,
  RiSearchLine,
  RiTwitterXLine,
} from "@remixicon/react"
import {
  ChainOfThoughtSearchResult,
  ChainOfThoughtSearchResults,
} from "@/components/ai-elements/chain-of-thought"
import type { SearchResult } from "@/components/timeline/parts"
import { DotmHex3 } from "@/components/ui/dotm-hex-3"
import { faviconFor, hostOf, shortHost } from "@/lib/urls"

/** Small pieces shared by every timeline node: the live loader, query badges,
 *  and the source list. */

export const SEARCH_META: Record<
  string,
  { icon: typeof RiGlobeLine; live: string; done: string }
> = {
  search: { icon: RiGlobeLine, live: "Searching the web", done: "Web Search" },
  xsearch: { icon: RiTwitterXLine, live: "Searching X", done: "X / Twitter" },
  reddit: { icon: RiRedditLine, live: "Searching Reddit", done: "Reddit" },
  map: { icon: RiNodeTree, live: "Mapping links", done: "Site map" },
}

// Live-node loader shown in place of the step icon.
export function Live() {
  return <DotmHex3 size={14} dotSize={2} className="text-primary-strong" />
}

export function QueryBadges({ queries }: { queries: string[] }) {
  if (queries.length === 0) return null
  return (
    <ChainOfThoughtSearchResults>
      {queries.map((q, i) => (
        <ChainOfThoughtSearchResult
          // biome-ignore lint/suspicious/noArrayIndexKey: queries may repeat; list is append-only
          key={i}
          className="fade-in slide-in-from-bottom-1 max-w-[15rem] animate-in fill-mode-both"
          style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}
          title={q}
        >
          <RiSearchLine className="size-3 shrink-0 opacity-60" />
          <span className="truncate font-mono">{q}</span>
        </ChainOfThoughtSearchResult>
      ))}
    </ChainOfThoughtSearchResults>
  )
}

function ResultRow({
  url,
  title,
  index = 0,
}: SearchResult & { index?: number }) {
  const host = hostOf(url)
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer noopener"
      className="fade-in group/source flex animate-in items-center gap-2.5 fill-mode-both px-3 py-2 transition-colors hover:bg-accent/60 motion-reduce:animate-none"
      style={{ animationDelay: `${Math.min(index, 8) * 30}ms` }}
    >
      {/* The row is a link, but nothing said so until you clicked. The favicon
          leans in and the title underlines on hover — enough signal without
          adding another icon to the row. */}
      {/* biome-ignore lint/performance/noImgElement: tiny external favicon */}
      <img
        src={faviconFor(host)}
        alt=""
        className="size-4 shrink-0 rounded-sm outline outline-black/10 transition-transform duration-200 ease-out-strong group-hover/source:translate-x-0.5 motion-reduce:transition-none dark:outline-white/10"
        loading="lazy"
      />
      <span className="min-w-0 flex-1 truncate text-foreground text-sm decoration-foreground/30 underline-offset-2 group-hover/source:underline">
        {title || host}
      </span>
      <span className="shrink-0 font-mono text-muted-foreground text-xs transition-colors group-hover/source:text-foreground/70">
        {shortHost(host)}
      </span>
    </a>
  )
}

export function ResultList({ results }: { results: SearchResult[] }) {
  if (results.length === 0) return null
  return (
    // Every source stays in the DOM — a long run just scrolls in place instead
    // of pushing the rest of the timeline off screen. overscroll-contain keeps
    // the wheel from chaining out to the transcript once the list bottoms out.
    <div className="max-h-80 divide-y divide-border/60 overflow-y-auto overscroll-contain rounded-xl border bg-card/50">
      {results.map((r, i) => (
        <ResultRow key={r.url} {...r} index={i} />
      ))}
    </div>
  )
}
