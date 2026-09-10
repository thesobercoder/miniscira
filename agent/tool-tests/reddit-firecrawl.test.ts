import { afterEach, describe, expect, mock, test } from "bun:test"

import { FIRECRAWL_NOT_CONFIGURED } from "../../lib/firecrawl-request"

const originalFetch = globalThis.fetch
const originalEnv = { ...process.env }

afterEach(() => {
  globalThis.fetch = originalFetch
  for (const key of ["FIRECRAWL_API_KEY", "FIRECRAWL_API_URL"] as const) {
    if (originalEnv[key] === undefined) delete process.env[key]
    else process.env[key] = originalEnv[key]
  }
})

async function executeTool(path: string, input: unknown) {
  const tool = (await import(path)).default as {
    execute: (input: unknown) => Promise<unknown>
  }
  return tool.execute(input)
}

function firecrawlWebResponse(web: unknown[]) {
  return Response.json({ data: { web } })
}

describe("reddit_search on Firecrawl", () => {
  test("sends site:reddit.com queries to the Firecrawl endpoint", async () => {
    process.env.FIRECRAWL_API_KEY = "test-key"
    delete process.env.FIRECRAWL_API_URL

    const seen: { url: string; body: Record<string, unknown> }[] = []
    const fetchMock = mock(async (url: string, init?: RequestInit) => {
      const body = JSON.parse(init?.body as string) as Record<string, unknown>
      seen.push({ url, body })
      return firecrawlWebResponse([
        {
          title: "Best setup",
          url: "https://www.reddit.com/r/selfhosted/comments/abc/best_setup/",
          markdown: "Thread content here",
        },
      ])
    })
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const result = (await executeTool("../tools/reddit_search", {
      queries: ["best self-hosted search"],
    })) as { queries: string[]; results: { url: string }[]; error?: string }

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(seen[0].url).toBe("https://api.firecrawl.dev/v2/search")
    expect(seen[0].body.query).toBe("site:reddit.com best self-hosted search")
    expect(result.error).toBeUndefined()
    expect(result.results).toHaveLength(1)
    expect(result.results[0].url).toContain("reddit.com")
  })

  test("filters out non-Reddit URLs", async () => {
    process.env.FIRECRAWL_API_KEY = "test-key"
    delete process.env.FIRECRAWL_API_URL

    globalThis.fetch = (async () =>
      firecrawlWebResponse([
        {
          title: "Blog post",
          url: "https://example.com/blog/search-tips",
          markdown: "Not reddit",
        },
        {
          title: "Thread",
          url: "https://www.reddit.com/r/selfhosted/comments/abc/tips/",
          markdown: "Reddit thread",
        },
      ])) as unknown as typeof fetch

    const result = (await executeTool("../tools/reddit_search", {
      queries: ["search tips"],
    })) as { results: { url: string; subreddit: string }[] }

    expect(result.results).toHaveLength(1)
    expect(result.results[0].url).toContain("reddit.com")
    expect(result.results[0].subreddit).toBe("selfhosted")
  })

  test("missing config returns the shared error with no key material", async () => {
    delete process.env.FIRECRAWL_API_KEY
    delete process.env.FIRECRAWL_API_URL

    const fetchMock = mock(async () => firecrawlWebResponse([]))
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const result = (await executeTool("../tools/reddit_search", {
      queries: ["search tips"],
    })) as { queries: string[]; error?: string; results: unknown[] }

    expect(fetchMock).not.toHaveBeenCalled()
    expect(result).toEqual({
      queries: ["search tips"],
      error: FIRECRAWL_NOT_CONFIGURED,
      results: [],
    })
    expect(JSON.stringify(result)).not.toContain("test-key")
  })

  test("self-hosted URL works without a key and sends no auth header", async () => {
    process.env.FIRECRAWL_API_URL = "http://firecrawl.local:3002/"
    delete process.env.FIRECRAWL_API_KEY

    const fetchMock = mock(async (url: string, init?: RequestInit) => {
      expect(url).toBe("http://firecrawl.local:3002/v2/search")
      const headers = init?.headers as Record<string, string>
      expect(headers.authorization).toBeUndefined()
      return firecrawlWebResponse([
        {
          title: "Thread",
          url: "https://www.reddit.com/r/selfhosted/comments/abc/tips/",
          markdown: "Reddit thread",
        },
      ])
    })
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const result = (await executeTool("../tools/reddit_search", {
      queries: ["search tips"],
    })) as { error?: string; results: unknown[] }

    expect(result.error).toBeUndefined()
    expect(result.results).toHaveLength(1)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
