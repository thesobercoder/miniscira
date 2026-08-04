import { satisfies } from "eve/evals/expect"

/**
 * eve's built-in `web_search` / `web_fetch` are disabled project-wide
 * (agent/tools/web_search.ts, web_fetch.ts). Search and page-reading are served
 * by several tools, and which one the agent picks is a legitimate judgement
 * call — so evals assert the CAPABILITY was used, not a specific tool name.
 *
 * Not named `*.eval.ts`, so the runner does not discover it as an eval.
 */
export const SEARCH_TOOLS = [
  "firecrawl_search",
  "exa_search",
  "x_search",
  "reddit_search",
] as const

export const READ_TOOLS = ["firecrawl_scrape", "firecrawl_map"] as const

type Call = { readonly name: string }

const used = (calls: readonly Call[], names: readonly string[]) =>
  calls.some((c) => names.includes(c.name))

/** Passes when at least one web-search tool was called. */
export const searched = (calls: readonly Call[]) =>
  satisfies<readonly Call[]>(
    () => used(calls, SEARCH_TOOLS as readonly string[]),
    `used a search tool (${SEARCH_TOOLS.join(" | ")})`
  )

/** Passes when at least one page-reading tool was called. */
export const read = (calls: readonly Call[]) =>
  satisfies<readonly Call[]>(
    () => used(calls, READ_TOOLS as readonly string[]),
    `used a read tool (${READ_TOOLS.join(" | ")})`
  )

/** Passes when a search happened before the first read — evidence, not snippets. */
export const searchedThenRead = (calls: readonly Call[]) =>
  satisfies<readonly Call[]>(() => {
    const firstSearch = calls.findIndex((c) =>
      (SEARCH_TOOLS as readonly string[]).includes(c.name)
    )
    const firstRead = calls.findIndex((c) =>
      (READ_TOOLS as readonly string[]).includes(c.name)
    )
    return firstSearch !== -1 && firstRead !== -1 && firstSearch < firstRead
  }, "searched, then opened a source")

/** Passes when NO web tool was touched — for "should not reach the open web". */
export const noWebTools = (calls: readonly Call[]) =>
  satisfies<readonly Call[]>(
    () => !used(calls, [...SEARCH_TOOLS, ...READ_TOOLS] as readonly string[]),
    "did not use any web search or read tool"
  )
