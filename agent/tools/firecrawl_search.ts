import { defineDynamic, defineTool } from "eve/tools"
import { z } from "zod"

import {
  FIRECRAWL_NOT_CONFIGURED,
  firecrawlConfig,
  firecrawlSearch,
} from "../../lib/firecrawl-request"

export const tool = defineTool({
  description:
    "Default general web search via Firecrawl — search and read in one step: it also scrapes each result's full page content (Markdown). Reach for it first for broad keyword queries. Supports query operators like `site:`, `filetype:pdf`, and `intitle:`.",
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
    const config = firecrawlConfig()
    if (!config.configured)
      return { query, error: FIRECRAWL_NOT_CONFIGURED, results: [] }

    const outcome = await firecrawlSearch(
      {
        query,
        limit,
        scrapeOptions: { formats: ["markdown"], onlyMainContent: true },
      },
      config
    )
    const results = outcome.results.slice(0, limit).map((r) => ({
      title: r.title ?? r.url,
      url: r.url,
      description: r.description,
      text:
        typeof r.markdown === "string" ? r.markdown.slice(0, 1500) : undefined,
    }))
    return {
      query,
      results,
      ...(outcome.error ? { error: outcome.error } : {}),
    }
  },
})

export default defineDynamic({
  events: {
    "step.started": () => (firecrawlConfig().configured ? tool : null),
  },
})
