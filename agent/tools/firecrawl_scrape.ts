import { defineTool } from "eve/tools"
import { z } from "zod"

type FirecrawlScrape = {
  markdown?: string
  metadata?: { title?: string; sourceURL?: string }
}

// The model sees this tool as `firecrawl_scrape`, from the filename.
export default defineTool({
  description:
    "Read a single URL as clean Markdown via Firecrawl. This is how you open a page: use it on the strongest search hits before relying on or citing them. Handles messy, empty, and JavaScript-rendered pages. Returns the page title and Markdown.",
  inputSchema: z.object({
    url: z.string().url().describe("The absolute URL to scrape."),
  }),
  async execute({ url }) {
    const key = process.env.FIRECRAWL_API_KEY
    const configuredBase = process.env.FIRECRAWL_API_URL?.trim()
    if (!key && !configuredBase)
      return {
        url,
        error:
          "Firecrawl is not configured. Set FIRECRAWL_API_KEY for Firecrawl Cloud or FIRECRAWL_API_URL for a self-hosted server.",
        markdown: "",
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
      res = await fetch(`${base}/v2/scrape`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          url,
          formats: ["markdown"],
          onlyMainContent: true,
        }),
      })
    } catch (err) {
      return {
        url,
        error: `Firecrawl request failed: ${(err as Error).message}`,
        markdown: "",
      }
    }
    if (!res.ok) {
      return {
        url,
        error: `Firecrawl scrape failed (HTTP ${res.status}).`,
        markdown: "",
      }
    }

    const data = (await res.json()) as { data?: FirecrawlScrape }
    const markdown = data.data?.markdown ?? ""
    return {
      url: data.data?.metadata?.sourceURL ?? url,
      title: data.data?.metadata?.title,
      markdown: markdown.slice(0, 8000),
    }
  },
})
