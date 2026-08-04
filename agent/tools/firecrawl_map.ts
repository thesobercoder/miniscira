import { defineTool } from "eve/tools"
import { z } from "zod"

type MapLink = string | { url: string; title?: string; description?: string }

// The model sees this tool as `firecrawl_map`, from the filename.
export default defineTool({
  description:
    "Map a website via Firecrawl: quickly list the URLs under a site or section (docs, blog, sitemap-style discovery). Use it when the user shares a link and you need to enumerate what's there — e.g. every page in a docs section or all posts on a blog — before deciding which pages to read with firecrawl_scrape. Supports an optional search term to filter the returned links.",
  inputSchema: z.object({
    url: z
      .string()
      .min(1)
      .describe(
        "The site or section URL to map, e.g. https://docs.example.com/guides"
      ),
    search: z
      .string()
      .optional()
      .describe(
        "Optional filter — only return links relevant to this term (e.g. 'authentication')."
      ),
    limit: z
      .number()
      .int()
      .min(1)
      .max(200)
      .optional()
      .describe("Max links to return (default 50)."),
  }),
  async execute({ url, search, limit = 50 }) {
    const key = process.env.FIRECRAWL_API_KEY
    if (!key)
      return {
        url,
        error: "FIRECRAWL_API_KEY is not configured.",
        results: [],
      }

    let res: Response
    try {
      res = await fetch("https://api.firecrawl.dev/v2/map", {
        method: "POST",
        headers: {
          authorization: `Bearer ${key}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ url, search, limit }),
      })
    } catch (err) {
      return {
        url,
        error: `Firecrawl request failed: ${(err as Error).message}`,
        results: [],
      }
    }
    if (!res.ok) {
      return {
        url,
        error: `Firecrawl map failed (HTTP ${res.status}).`,
        results: [],
      }
    }

    const data = (await res.json()) as { links?: MapLink[] }
    const results = (data.links ?? [])
      .slice(0, limit)
      .map((l) =>
        typeof l === "string"
          ? { url: l, title: l }
          : { url: l.url, title: l.title || l.url }
      )
    return { url, search, count: results.length, results }
  },
})
