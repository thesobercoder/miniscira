import { defineTool } from "eve/tools"
import { z } from "zod"

type YouComWebResult = {
  url?: string
  title?: string
  description?: string
  page_age?: string
  snippets?: string[]
}

// The model sees this tool as `reddit_search`, from the filename.
export default defineTool({
  description:
    "Search Reddit discussions using the You.com API with multiple queries. Great for opinions, lived experiences, and community consensus.",
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
      .describe("Optional per-query time range (maps to You.com freshness)."),
  }),
  async execute({ queries, maxResults, timeRange }) {
    const key = process.env.YOU_COM_API_KEY
    if (!key)
      return {
        queries,
        error: "YOU_COM_API_KEY is not configured.",
        results: [],
      }

    const perQuery = await Promise.all(
      queries.map(async (query, i) => {
        const count = Math.min(
          Math.max(maxResults?.[i] ?? maxResults?.[0] ?? 20, 10),
          25
        )
        const freshness = timeRange?.[i] ?? timeRange?.[0]
        try {
          const body: Record<string, unknown> = {
            query,
            crawl_timeout: 10,
            language: "EN",
            safesearch: "off",
            include_domains: ["reddit.com"],
            count,
            offset: 0,
          }
          if (freshness) body.freshness = freshness

          const res = await fetch("https://ydc-index.io/v1/search", {
            method: "POST",
            headers: {
              "X-API-KEY": key,
              "content-type": "application/json",
              accept: "application/json",
            },
            body: JSON.stringify(body),
          })
          if (!res.ok) return []

          const data = (await res.json()) as {
            results?: { web?: YouComWebResult[] }
          }
          return (data.results?.web ?? [])
            .map((r) => {
              const m =
                typeof r.url === "string"
                  ? r.url.match(/reddit\.com\/r\/([^/]+)/i)
                  : null
              const subreddit = m?.[1] ?? "unknown"
              const snippets = (r.snippets ?? []).filter(
                (s): s is string => typeof s === "string" && s.length > 0
              )
              const text = [r.description, ...snippets]
                .filter(Boolean)
                .join("\n\n")
              return {
                url: r.url ?? "",
                title: r.title ?? r.url ?? "",
                text,
                subreddit,
                publishedDate: r.page_age,
              }
            })
            .filter((r) => r.url)
        } catch (err) {
          console.error(`reddit_search failed for "${query}"`, err)
          return []
        }
      })
    )

    const seen = new Set<string>()
    const results = perQuery
      .flat()
      .filter((r) => !seen.has(r.url) && seen.add(r.url))
    return { queries, results }
  },
})
