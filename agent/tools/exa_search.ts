import { defineTool } from "eve/tools"
import { z } from "zod"

type ExaResult = {
  title?: string
  url: string
  publishedDate?: string
  author?: string
  text?: string
  highlights?: string[]
  summary?: string
}

// The model sees this tool as `exa_search`, from the filename.
export default defineTool({
  description:
    "Neural/semantic web search via Exa. Best for finding conceptually related, high-quality sources (research papers, in-depth articles, docs) where meaning matters more than keywords. Returns titles, URLs, dates, and text snippets. Use firecrawl_search for broad keyword queries; reach for this when you want the most relevant or authoritative sources.",
  inputSchema: z.object({
    query: z.string().min(1).describe("The search query."),
    numResults: z
      .number()
      .int()
      .min(1)
      .max(20)
      .optional()
      .describe("Number of results to return (default 8)."),
    category: z
      .enum([
        "company",
        "research paper",
        "news",
        "personal site",
        "financial report",
        "people",
      ])
      .optional()
      .describe("Optional category to focus the search on."),
  }),
  async execute({ query, numResults = 8, category }) {
    const key = process.env.EXA_API_KEY
    if (!key)
      return { query, error: "EXA_API_KEY is not configured.", results: [] }

    let res: Response
    try {
      res = await fetch("https://api.exa.ai/search", {
        method: "POST",
        headers: { "x-api-key": key, "content-type": "application/json" },
        body: JSON.stringify({
          query,
          numResults,
          type: "auto",
          ...(category ? { category } : {}),
          contents: { text: { maxCharacters: 1200 }, highlights: true },
        }),
      })
    } catch (err) {
      return {
        query,
        error: `Exa request failed: ${(err as Error).message}`,
        results: [],
      }
    }
    if (!res.ok) {
      return {
        query,
        error: `Exa search failed (HTTP ${res.status}).`,
        results: [],
      }
    }

    const data = (await res.json()) as { results?: ExaResult[] }
    const results = (data.results ?? []).map((r) => ({
      title: r.title ?? r.url,
      url: r.url,
      publishedDate: r.publishedDate,
      text:
        typeof r.text === "string"
          ? r.text.slice(0, 1200)
          : Array.isArray(r.highlights)
            ? r.highlights.join(" … ")
            : r.summary,
    }))
    return { query, results }
  },
})
