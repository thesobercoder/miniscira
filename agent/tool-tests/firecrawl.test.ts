import { afterEach, describe, expect, mock, test } from "bun:test"

const originalFetch = globalThis.fetch
const originalKey = process.env.FIRECRAWL_API_KEY
const originalUrl = process.env.FIRECRAWL_API_URL

afterEach(() => {
  globalThis.fetch = originalFetch
  if (originalKey === undefined) delete process.env.FIRECRAWL_API_KEY
  else process.env.FIRECRAWL_API_KEY = originalKey
  if (originalUrl === undefined) delete process.env.FIRECRAWL_API_URL
  else process.env.FIRECRAWL_API_URL = originalUrl
})

async function executeTool(path: string, input: unknown) {
  const tool = (await import(path)).default as {
    execute: (input: unknown) => Promise<unknown>
  }
  return tool.execute(input)
}

describe("Firecrawl self-hosted configuration", () => {
  test.each([
    [
      "../tools/firecrawl_search",
      { query: "MiniScira", limit: 1 },
      "/v2/search",
    ],
    ["../tools/firecrawl_scrape", { url: "https://example.com" }, "/v2/scrape"],
    [
      "../tools/firecrawl_map",
      { url: "https://example.com", limit: 5 },
      "/v2/map",
    ],
  ])(
    "%s works with FIRECRAWL_API_URL and no API key",
    async (path, input, endpoint) => {
      process.env.FIRECRAWL_API_URL = "http://firecrawl.local:3002/"
      delete process.env.FIRECRAWL_API_KEY

      const fetchMock = mock(async (url: string, init?: RequestInit) => {
        expect(url).toBe(`http://firecrawl.local:3002${endpoint}`)
        const headers = init?.headers as Record<string, string>
        expect(headers.authorization).toBeUndefined()

        if (endpoint === "/v2/search")
          return Response.json({
            data: { web: [{ url: "https://example.com" }] },
          })
        if (endpoint === "/v2/scrape")
          return Response.json({
            data: {
              markdown: "Example content",
              metadata: { title: "Example Domain" },
            },
          })
        return Response.json({ links: ["https://example.com/about"] })
      })
      globalThis.fetch = fetchMock as unknown as typeof fetch

      const result = await executeTool(path, input)
      expect(result).not.toHaveProperty("error")
      expect(fetchMock).toHaveBeenCalledTimes(1)
    }
  )

  test("Firecrawl Cloud still requires a key when no self-hosted URL is set", async () => {
    delete process.env.FIRECRAWL_API_URL
    delete process.env.FIRECRAWL_API_KEY
    const result = (await executeTool("../tools/firecrawl_scrape", {
      url: "https://example.com",
    })) as { error?: string }
    expect(result.error).toContain("Firecrawl is not configured")
  })
})
