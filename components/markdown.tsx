import { isValidElement, useMemo } from "react"
import { toast } from "sonner"
import { Streamdown } from "streamdown"
import "streamdown/styles.css"

import { copyText } from "@/lib/clipboard"
import { faviconFor, hostOf, shortHost } from "@/lib/urls"
import { cn } from "@/lib/utils"

/** Flatten a React subtree to its text, to inspect a link's visible label. */
function textOf(node: React.ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node)
  if (Array.isArray(node)) return node.map(textOf).join("")
  if (isValidElement<{ children?: React.ReactNode }>(node)) {
    return textOf(node.props.children)
  }
  return ""
}

// The agent cites sources as parenthesised links on the claim they support —
// `[(WebKit Safari 26 blog)](https://…)`. Streamdown's stock anchor renders
// those as `text-primary underline`, i.e. lime-on-white at 1.45:1 (see the
// --primary-strong note in globals.css), so a run of them reads as a wall of
// glowing green. Parenthesised links become compact favicon chips instead;
// links on ordinary prose words stay prose links, in the accessible tone.
const PARENTHESISED = /^\(([\s\S]+)\)$/

// The instructions tell the agent to keep citations inside the sentence, but when
// it slips and trails them after the period it closes the run with a *second*
// period — `…in WebKit). [(wiki)](a) [(blog)](b).` — which renders as a visible
// double stop. Drop the duplicate so the sentence keeps one terminator and the
// citations trail it. Deliberately narrow: it only fires on a run of
// parenthesised links flanked by the *same* terminator, and never matches
// mid-stream (the closing link is still unparsed), so nothing reflows while
// streaming.
const DUPLICATE_TERMINATOR =
  /([.!?])((?:[ \t]*\[\([^\]]*\)\]\([^\s)]*\))+)[ \t]*\1/g

// The model also trails sources as a parenthesised list of bare URLs:
// `…quirks on CDNs. ([a.com/x](a); [b.com](b)).` Same shape as the above, so
// normalise it into that form and let the chip renderer handle both. The group
// must contain *only* links and separators, which keeps genuine prose
// parentheses (`(see [the docs](url))`) untouched.
const LINK = String.raw`\[[^\]]*\]\([^\s)]*\)`
const CITATION_GROUP = new RegExp(
  String.raw`\((${LINK}(?:\s*[;,]\s*${LINK})*)\)`,
  "g"
)
// The most common slip in practice (175 of 271 citations in recent answers):
// the model wraps the whole citation in square brackets, academic style —
// `…scalable manufacturing. [[Fortune Business Insights (2026 report)](url)]`.
// Markdown renders the outer brackets as literal text around a prose-titled
// link, so it read as "[Some Source Name]" in the middle of the paragraph
// instead of a chip. Same treatment as the parenthesised run: fold it into the
// `[(label)](url)` shape the chip renderer already understands.
const BRACKETED_CITATION_GROUP = new RegExp(
  String.raw`\[(${LINK}(?:\s*[;,]\s*${LINK})*)\]`,
  "g"
)
// The other shape seen in the running app: a run of source-name links dumped
// at the end of a sentence with nothing between them —
// `…at fractions of prior costs. [Official GPT-5 announcement](a) [o3 and
// o4-mini announcement](b) [GPT-5.6 announcement](c).` Rendered as prose that
// is three long green links wrapping across two lines; as chips it is three
// favicons. Two or more links separated by whitespace alone is the tell —
// running prose never puts links back-to-back like that — so a single inline
// link is deliberately left untouched. `**` wrappers are absorbed because the
// model often bolds these.
const BOLD = String.raw`(?:\*\*)?`
const ADJACENT_LINK_RUN = new RegExp(
  String.raw`${BOLD}${LINK}${BOLD}(?:[ \t]+${BOLD}${LINK}${BOLD})+`,
  "g"
)
const CITATION_SEPARATOR = /\s*[;,]\s*/
const LINK_PARTS = /\[([^\]]*)\]\(([^\s)]*)\)/
const LINK_GLOBAL = /\[([^\]]*)\]\(([^\s)]*)\)/g

// A link whose text is its own URL or domain is a source reference, not claim
// words — chip it like a parenthesised one.
const BARE_URL_TEXT = /^(?:https?:\/\/)?[\w-]+(?:\.[\w-]+)+(?:\/\S*)?$/

/**
 * Fold the agent's trailing-citation variants into one renderable shape.
 *
 * @public Exported for unit tests; the component uses it internally.
 */
export function normalizeCitations(markdown: string) {
  // Cheap bail-out first. This runs on every render of a streaming answer, so
  // for the (common) case of prose with no links at all, a substring scan beats
  // two global regexes with nested alternation.
  if (!markdown.includes("](")) return markdown
  const chipify = (whole: string, inner: string) => {
    const links = inner.split(CITATION_SEPARATOR).map((link) => {
      const parts = LINK_PARTS.exec(link)
      // Already parenthesised — leave it, or we'd double-wrap the label.
      if (!parts) return null
      return PARENTHESISED.test(parts[1])
        ? `[${parts[1]}](${parts[2]})`
        : `[(${parts[1]})](${parts[2]})`
    })
    return links.every(Boolean) ? links.join(" ") : whole
  }
  return markdown
    .replace(CITATION_GROUP, chipify)
    .replace(BRACKETED_CITATION_GROUP, chipify)
    .replace(ADJACENT_LINK_RUN, (run) =>
      // Drop the bold too: a row of chips should not also be shouting.
      run
        .replace(/\*\*/g, "")
        .replace(LINK_GLOBAL, (whole, label: string, url: string) =>
          PARENTHESISED.test(label) ? whole : `[(${label})](${url})`
        )
    )
    .replace(DUPLICATE_TERMINATOR, "$1$2")
}

/** Copy a rendered Streamdown code block through MiniScira's LAN-safe helper. */
export function copyRenderedCode(button: Element): Promise<boolean> {
  const block = button.closest('[data-streamdown="code-block"]')
  const code = block?.querySelector("pre code")?.textContent ?? ""
  return copyText(code)
}

// AIcss-style table skin (aicss.dev/components/data-table), translated from its
// CSS-module demo into our Tailwind/shadcn idiom and wired into Streamdown so
// every GFM table in an answer renders as a tidy card instead of raw rules:
// a rounded bordered shell, a muted header row, hairline row dividers, and
// tabular-figure alignment so numeric columns line up.
const markdownComponents = {
  a: ({
    children,
    className,
    href,
    node: _node,
    ...props
  }: React.ComponentProps<"a"> & { node?: unknown }) => {
    const text = textOf(children).trim()
    const label = href?.startsWith("http")
      ? (PARENTHESISED.exec(text)?.[1] ??
        (BARE_URL_TEXT.test(text) ? text : undefined))
      : undefined

    if (!(href && label)) {
      return (
        <a
          className={cn(
            "wrap-anywhere font-medium text-primary-strong underline decoration-primary-strong/40 underline-offset-2 transition-colors hover:decoration-primary-strong",
            className
          )}
          href={href}
          rel="noreferrer"
          target="_blank"
          {...props}
        >
          {children}
        </a>
      )
    }

    const host = hostOf(href)
    return (
      <a
        className="mx-px inline-flex h-[1.125rem] max-w-[12rem] translate-y-px items-center gap-1 rounded-full border border-border bg-muted/60 pr-1.5 pl-1 align-middle font-medium text-[11px] text-muted-foreground no-underline transition-colors hover:border-primary-strong/40 hover:bg-primary/15 hover:text-foreground"
        href={href}
        rel="noreferrer"
        target="_blank"
        title={`${label} — ${host}`}
      >
        {/* biome-ignore lint/performance/noImgElement: tiny external favicon */}
        <img
          alt=""
          className="size-3 shrink-0 rounded-[2px]"
          height={12}
          loading="lazy"
          src={faviconFor(host)}
          width={12}
        />
        <span className="truncate">{shortHost(host)}</span>
      </a>
    )
  },
  table: ({ className, children, ...props }: React.ComponentProps<"table">) => (
    <div className="my-4 w-full overflow-x-auto rounded-xl border border-border">
      <table
        className={cn("w-full border-collapse text-sm", className)}
        {...props}
      >
        {children}
      </table>
    </div>
  ),
  thead: ({ className, ...props }: React.ComponentProps<"thead">) => (
    <thead className={cn("bg-muted/60", className)} {...props} />
  ),
  th: ({ className, ...props }: React.ComponentProps<"th">) => (
    <th
      className={cn(
        "border-border border-b px-3.5 py-2 text-left align-middle font-medium text-muted-foreground text-xs tracking-wide [&[align=center]]:text-center [&[align=right]]:text-right",
        className
      )}
      {...props}
    />
  ),
  td: ({ className, ...props }: React.ComponentProps<"td">) => (
    <td
      className={cn(
        "border-border/60 border-b px-3.5 py-2 align-middle tabular-nums [&[align=center]]:text-center [&[align=right]]:text-right",
        className
      )}
      {...props}
    />
  ),
  tr: ({ className, ...props }: React.ComponentProps<"tr">) => (
    <tr
      className={cn(
        "transition-colors hover:bg-muted/30 last:[&>td]:border-b-0",
        className
      )}
      {...props}
    />
  ),
}

/**
 * Streaming-aware markdown renderer (Vercel Streamdown). Handles unterminated
 * blocks mid-stream, GFM tables/autolinks, and Shiki code highlighting, themed
 * with our shadcn CSS variables. When `animating` is set (the answer is still
 * streaming) words slide in per-word; Streamdown drops the animation plugin
 * once the turn settles, so completed messages carry zero extra DOM.
 *
 * The blanket `prefers-reduced-motion` block in globals.css collapses the
 * per-word duration to ~0, so this needs no separate opt-out.
 */
export function Markdown({
  children,
  className,
  animating = false,
}: {
  children: string
  className?: string
  animating?: boolean
}) {
  // Memoized so a re-render that doesn't change the text (a parent re-rendering
  // mid-stream) doesn't redo the regex work.
  const source = useMemo(() => normalizeCitations(children), [children])
  return (
    <div
      onClickCapture={(event) => {
        const target = event.target
        if (!(target instanceof Element)) return
        const button = target.closest<HTMLButtonElement>(
          '[data-streamdown="code-block-copy-button"]'
        )
        if (!button) return

        // Streamdown 2.5 calls navigator.clipboard directly. That API is absent
        // on MiniScira's normal plain-http LAN origin, while copyText has the
        // synchronous selection fallback required there.
        event.stopPropagation()
        void copyRenderedCode(button).then((copied) => {
          if (!copied) toast.error("Couldn't copy that code")
        })
      }}
    >
      <Streamdown
        parseIncompleteMarkdown
        className={cn("text-sm leading-7 [&>*:first-child]:mt-0", className)}
        shikiTheme={["github-light", "github-dark"]}
        // Only carry the animation while actually streaming. Once static,
        // dropping `animated`/`isAnimating` stops Streamdown from replaying the
        // per-token fade whenever a *later* turn re-renders this settled message.
        mode={animating ? "streaming" : "static"}
        {...(animating
          ? {
              animated: {
                animation: "slideUp",
                // Milliseconds. Streamdown emits `--sd-duration:${duration}ms`
                // and defaults to 150; the value this was written with (4) is
                // below a frame, so the entrance never actually showed.
                duration: 150,
                easing: "ease-in",
                // No cascade. Streamdown's default staggers each *new* word by
                // 40ms (`--sd-delay: newIndex * stagger`), and its rule is
                // `animation: … both`, so a word sits at the keyframe's opacity:0
                // for the whole of its delay. A word is only exempt from being
                // "new" while the plugin's `prevContentLength` is non-zero — and
                // that counter is a single shared value which `getLastRenderCharCount()`
                // zeroes on read. Any render that reads it out of step re-staggers
                // a whole block from index 0, so a 400-word answer hands its tail
                // ~16s of delay and renders as blank space with a few words in it.
                //
                // The cascade was never worth that: tokens already arrive one at a
                // time, so the stream paces the reveal by itself. At 0 the words
                // still fade and slide in, they just do it when they arrive
                // instead of queueing behind an artificial timeline.
                stagger: 0,
              },
              isAnimating: true,
            }
          : {})}
        components={markdownComponents}
      >
        {source}
      </Streamdown>
    </div>
  )
}
