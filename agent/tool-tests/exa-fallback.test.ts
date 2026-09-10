import { afterEach, describe, expect, mock, test } from "bun:test"

const originalFetch = globalThis.fetch
const originalEnv = { ...process.env }

afterEach(() => {
  globalThis.fetch = originalFetch
  for (const key of ["EXA_API_KEY", "FIRECRAWL_API_KEY", "FIRECRAWL_API_URL"] as const) {
    if (originalEnv[key] === undefined) delete process.env[key]
    else process.env[key] = originalEnv[key]
  }
})

// Exa stays usable as a fallback when it is the only search key set.
describe("exa_search fallback", () => {
  test("works when only EXA_API_KEY is set", async () => {
    process.env.EXA_API_KEY = "test-exa-key"
    delete process.env.FIRECRAWL_API_KEY
    delete process.env.FIRECRAWL_API_URL

    const fetchMock = mock(async (url: string, init?: RequestInit) => {
      expect(url).toBe("https://api.exa.ai/search")
      const headers = init?.headers as Record<string, string>
      expect(headers["x-api-key"]).toBe("test-exa-key")
      return Response.json({
        results: [
          {
            title: "Authoritative paper",
            url: "https://example.com/paper",
            text: "Paper abstract",
          },
        ],
      })
    })
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const tool = (await import("../tools/exa_search")).default as unknown as {
      execute: (input: unknown) => Promise<unknown>
    }
    const result = (await tool.execute({
      query: "most authoritative paper on narrow topic",
    })) as { query: string; error?: string; results: { url: string }[] }

    expect(result.error).toBeUndefined()
    expect(result.results).toHaveLength(1)
    expect(result.results[0].url).toBe("https://example.com/paper")
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
