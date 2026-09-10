/**
 * Shared Firecrawl request setup for search tools.
 *
 * `firecrawl_search`, `reddit_search`, and the future GitHub tool all POST to
 * the same Firecrawl `/v2/search` endpoint with the same base-URL rules and
 * the same missing-config error. One module keeps those in sync.
 *
 * Env is read at CALL time, never import time: tests mutate env between calls
 * and operators can change it without a rebuild.
 */

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

export function firecrawlSearch(
  body: Record<string, unknown>,
  config: FirecrawlConfig = firecrawlConfig()
): Promise<Response> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
  }
  if (config.apiKey) headers.authorization = `Bearer ${config.apiKey}`
  return fetch(`${config.baseUrl}/v2/search`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  })
}
