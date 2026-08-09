import { defineTool } from "eve/tools"
import { z } from "zod"

type FirecrawlWebResult = {
  title?: string
  description?: string
  url: string
  markdown?: string
}

// The model sees this tool as `firecrawl_search`, from the filename.
export default defineTool({
  description:
    "Web search that also scrapes each result's full page content (Markdown) via Firecrawl — search and read in one step. Useful when you need the actual page text, not just snippets. Supports query operators like `site:`, `filetype:pdf`, and `intitle:`.",
  inputSchema: z.object({
    query: z
      .string()
      .min(1)
      .describe(
        "The search query. Supports site:/filetype:/intitle: operators."
      ),
    limit: z
      .number()
      .int()
      .min(1)
      .max(15)
      .optional()
      .describe("Max number of results to return (default 6)."),
  }),
  async execute({ query, limit = 6 }) {
    const key = process.env.FIRECRAWL_API_KEY
    const configuredBase = process.env.FIRECRAWL_API_URL?.trim()
    if (!key && !configuredBase)
      return {
        query,
        error:
          "Firecrawl is not configured. Set FIRECRAWL_API_KEY for Firecrawl Cloud or FIRECRAWL_API_URL for a self-hosted server.",
        results: [],
      }

    let res: Response
    try {
      const base = (configuredBase ?? "https://api.firecrawl.dev").replace(
        /\/+$/,
        ""
      )
      const headers: Record<string, string> = {
        "content-type": "application/json",
      }
      if (key) headers.authorization = `Bearer ${key}`
      res = await fetch(`${base}/v2/search`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          query,
          limit,
          scrapeOptions: { formats: ["markdown"], onlyMainContent: true },
        }),
      })
    } catch (err) {
      return {
        query,
        error: `Firecrawl request failed: ${(err as Error).message}`,
        results: [],
      }
    }
    if (!res.ok) {
      return {
        query,
        error: `Firecrawl search failed (HTTP ${res.status}).`,
        results: [],
      }
    }

    const data = (await res.json()) as {
      data?: { web?: FirecrawlWebResult[] }
    }
    const results = (data.data?.web ?? []).map((r) => ({
      title: r.title ?? r.url,
      url: r.url,
      description: r.description,
      text:
        typeof r.markdown === "string" ? r.markdown.slice(0, 1500) : undefined,
    }))
    return { query, results }
  },
})
