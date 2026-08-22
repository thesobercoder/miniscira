import { defineTool } from "eve/tools"
import { z } from "zod"
import { redditQuery } from "../../lib/reddit-search"

type SearxResult = {
  url?: string
  title?: string
  content?: string
  publishedDate?: string
  engine?: string
  engines?: string[]
}

// The model sees this tool as `reddit_search`, from the filename.
export default defineTool({
  description:
    "Search public Reddit discussions through the configured SearXNG instance. Great for opinions, lived experiences, and community consensus.",
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
    const baseUrl = process.env.SEARXNG_URL?.trim()
    if (!baseUrl)
      return {
        queries,
        error: "SEARXNG_URL is not configured.",
        results: [],
      }

    const perQuery = await Promise.all(
      queries.map(async (query, i) => {
        const count = Math.min(
          Math.max(maxResults?.[i] ?? maxResults?.[0] ?? 20, 1),
          25
        )
        const params = new URLSearchParams({
          q: redditQuery(query),
          format: "json",
          language: "en",
          safesearch: "0",
        })
        const range = timeRange?.[i] ?? timeRange?.[0]
        if (range) params.set("time_range", range)

        try {
          const res = await fetch(
            `${baseUrl.replace(/\/$/, "")}/search?${params.toString()}`,
            { headers: { accept: "application/json" } }
          )
          if (!res.ok) return []
          const data = (await res.json()) as { results?: SearxResult[] }
          return (data.results ?? [])
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
                text: result.content ?? "",
                subreddit,
                publishedDate: result.publishedDate,
                engines:
                  result.engines ??
                  (result.engine ? [result.engine] : undefined),
              }
            })
        } catch (err) {
          console.error(`reddit_search failed for "${query}"`, err)
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
