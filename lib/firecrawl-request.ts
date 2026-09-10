import { z } from "zod"

export type FirecrawlConfig = {
  apiKey?: string
  baseUrl: string
  configured: boolean
}

export const FIRECRAWL_NOT_CONFIGURED =
  "Firecrawl is not configured. Set FIRECRAWL_API_KEY for Firecrawl Cloud or FIRECRAWL_API_URL for a self-hosted server."

export function firecrawlConfig(): FirecrawlConfig {
  const apiKey = process.env.FIRECRAWL_API_KEY?.trim() || undefined
  const rawBase = process.env.FIRECRAWL_API_URL?.trim() || undefined
  const baseUrl = (rawBase ?? "https://api.firecrawl.dev").replace(/\/+$/, "")
  return { apiKey, baseUrl, configured: Boolean(apiKey ?? rawBase) }
}

const webResult = z.object({
  url: z.url().refine((url) => /^https?:\/\//i.test(url)),
  title: z.string().optional(),
  description: z.string().optional(),
  markdown: z.string().optional(),
})

const searchResponse = z.object({
  success: z.boolean().optional(),
  data: z.object({ web: z.array(z.unknown()) }),
})

type SearchOutcome = {
  results: z.infer<typeof webResult>[]
  error?: string
}

export async function firecrawlSearch(
  body: Record<string, unknown>,
  config: FirecrawlConfig = firecrawlConfig()
): Promise<SearchOutcome> {
  if (!config.configured)
    return { results: [], error: FIRECRAWL_NOT_CONFIGURED }
  const headers: Record<string, string> = {
    "content-type": "application/json",
  }
  if (config.apiKey) headers.authorization = `Bearer ${config.apiKey}`
  let response: Response
  try {
    response = await fetch(`${config.baseUrl}/v2/search`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60_000),
    })
  } catch {
    return { results: [], error: "Firecrawl search request failed." }
  }
  if (!response.ok) {
    return {
      results: [],
      error: `Firecrawl search failed (HTTP ${response.status}).`,
    }
  }
  let data: unknown
  try {
    data = await response.json()
  } catch {
    return { results: [], error: "Firecrawl search returned invalid JSON." }
  }
  const parsed = searchResponse.safeParse(data)
  if (!parsed.success) {
    return {
      results: [],
      error: z.object({ success: z.literal(false) }).safeParse(data).success
        ? "Firecrawl search reported a provider failure."
        : "Firecrawl search returned an invalid response.",
    }
  }
  const results: SearchOutcome["results"] = []
  let malformed = false
  for (const item of parsed.data.data.web) {
    const result = webResult.safeParse(item)
    if (result.success) results.push(result.data)
    else malformed = true
  }
  const error =
    parsed.data.success === false
      ? "Firecrawl search reported a provider failure."
      : malformed
        ? "Firecrawl search returned invalid results."
        : undefined
  return { results, ...(error ? { error } : {}) }
}
