import { defineTool } from "eve/tools"
import { z } from "zod"

import {
  FIRECRAWL_NOT_CONFIGURED,
  firecrawlConfig,
  firecrawlSearch,
} from "../../lib/firecrawl-request"
import { redditQuery } from "../../lib/reddit-search"

type FirecrawlWebResult = {
  title?: string
  description?: string
  url: string
  markdown?: string
}

// Reddit search runs on the same Firecrawl key as general search — no second
// search service. Each query is scoped with `site:reddit.com` (redditQuery)
// and sent to the shared Firecrawl `/v2/search` endpoint.
export default defineTool({
  description:
    "Search public Reddit discussions via Firecrawl. Great for opinions, lived experiences, and community consensus.",
  inputSchema: z.object({
    queries: z
      .array(z.string().max(200))
      .min(1)
      .max(5)
      .describe("Array of Reddit search queries (recommended 3–5)."),
    maxResults: z
      .array(z.number().int().min(1).max(25))
      .max(5)
      .optional()
      .describe("Optional per-query max results (default 20, max 25)."),
    timeRange: z
      .array(z.enum(["day", "week", "month", "year"]))
      .optional()
      .describe("Optional per-query time range."),
  }),
  async execute({ queries, maxResults, timeRange }) {
    const config = firecrawlConfig()
    if (!config.configured)
      return { queries, error: FIRECRAWL_NOT_CONFIGURED, results: [] }

    // Firecrawl date filter values; keeps the per-query timeRange input shape.
    const tbsFor = (range: "day" | "week" | "month" | "year") =>
      ({ day: "qdr:d", week: "qdr:w", month: "qdr:m", year: "qdr:y" })[range]

    const perQuery = await Promise.all(
      queries.map(async (query, i) => {
        const count = Math.min(
          Math.max(maxResults?.[i] ?? maxResults?.[0] ?? 20, 1),
          25
        )
        const range = timeRange?.[i] ?? timeRange?.[0]
        try {
          const res = await firecrawlSearch(
            {
              query: redditQuery(query),
              limit: count,
              ...(range ? { tbs: tbsFor(range) } : {}),
              scrapeOptions: { formats: ["markdown"], onlyMainContent: true },
            },
            config
          )
          if (!res.ok) return []
          const data = (await res.json()) as {
            data?: { web?: FirecrawlWebResult[] }
          }
          return (data.data?.web ?? [])
            .filter(
              (result) =>
                typeof result.url === "string" &&
                /https?:\/\/(?:www\.)?reddit\.com\//i.test(result.url)
            )
            .slice(0, count)
            .map((result) => {
              const subreddit =
                result.url?.match(/reddit\.com\/r\/([^/]+)/i)?.[1] ?? "unknown"
              return {
                url: result.url ?? "",
                title: result.title ?? result.url ?? "",
                text:
                  typeof result.markdown === "string"
                    ? result.markdown.slice(0, 1500)
                    : (result.description ?? ""),
                subreddit,
              }
            })
        } catch {
          // Log a fixed string only: queries are user content and fetch
          // errors can carry URLs, so neither is logged.
          console.error("reddit_search provider failure")
          return []
        }
      })
    )

    const seen = new Set<string>()
    const results = perQuery
      .flat()
      .filter((result) => !seen.has(result.url) && seen.add(result.url))
    return { queries, results }
  },
})
