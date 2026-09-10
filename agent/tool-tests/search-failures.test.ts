import { afterEach, expect, test } from "bun:test"
import { tool as general } from "../tools/firecrawl_search"
import { tool as reddit } from "../tools/reddit_search"
import { searchContext } from "./search-context"

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

const secret = "fixture-secret-do-not-echo"
const failures = [
  [
    "provider without data",
    () => Response.json({ success: false, error: secret }),
    "provider failure",
  ],
  [
    "network",
    () => {
      throw new Error(`https://user:${secret}@provider.invalid`)
    },
    "request failed",
  ],
  ["HTTP", () => new Response(secret, { status: 429 }), "HTTP 429"],
  ["JSON", () => new Response(secret), "invalid JSON"],
  ["envelope", () => Response.json({ unexpected: secret }), "invalid response"],
  ["null", () => Response.json(null), "invalid response"],
  [
    "provider",
    () => Response.json({ success: false, error: secret, data: { web: [] } }),
    "provider failure",
  ],
  [
    "row",
    () => Response.json({ data: { web: [{ url: 42, title: secret }] } }),
    "invalid results",
  ],
] as const

for (const [name, response, error] of failures) {
  test(`${name} failure reaches both tools without provider details`, async () => {
    process.env.FIRECRAWL_API_KEY = secret
    globalThis.fetch = Object.assign(async () => response(), {
      preconnect: originalFetch.preconnect,
    })
    const results = [
      await general.execute({ query: "test" }, searchContext),
      await reddit.execute({ queries: ["test"] }, searchContext),
    ]
    for (const result of results) {
      expect(result.results).toEqual([])
      expect(result.error).toContain(error)
      expect(JSON.stringify(result)).not.toContain(secret)
    }
  })
}

test("Reddit keeps successful queries and valid rows while reporting partial failures", async () => {
  process.env.FIRECRAWL_API_KEY = secret
  let call = 0
  globalThis.fetch = Object.assign(
    async () => {
      if (call++ === 0) return new Response(secret, { status: 503 })
      return Response.json({
        data: {
          web: [
            {
              url: "https://www.reddit.com/r/test/comments/1",
              title: "Valid",
              markdown: "Evidence",
            },
            {
              url: "https://example.com/https://reddit.com/r/fake",
              title: "Spoofed",
            },
            {
              url: "https://www.reddit.com/r/test/comments/1",
              title: "Duplicate",
            },
            { url: null },
          ],
        },
      })
    },
    { preconnect: originalFetch.preconnect }
  )
  const result = await reddit.execute(
    { queries: ["first", "second"] },
    searchContext
  )
  expect(result.results).toEqual([
    {
      url: "https://www.reddit.com/r/test/comments/1",
      title: "Valid",
      text: "Evidence",
      subreddit: "test",
    },
  ])
  expect(result.error).toBe(
    "Query 1: Firecrawl search failed (HTTP 503). Query 2: Firecrawl search returned invalid results."
  )
})

test("general search keeps valid rows and distinguishes a genuine empty search", async () => {
  process.env.FIRECRAWL_API_KEY = secret
  globalThis.fetch = Object.assign(
    async () =>
      Response.json({
        data: {
          web: [
            {
              url: "https://example.com",
              title: "Valid",
              markdown: "Evidence",
            },
            { url: "javascript:alert(1)" },
          ],
        },
      }),
    { preconnect: originalFetch.preconnect }
  )
  const result = await general.execute({ query: "test" }, searchContext)
  expect(result.results).toEqual([
    {
      url: "https://example.com",
      title: "Valid",
      text: "Evidence",
      description: undefined,
    },
  ])
  expect(result.error).toContain("invalid results")
  globalThis.fetch = Object.assign(
    async () => Response.json({ success: true, data: { web: [] } }),
    { preconnect: originalFetch.preconnect }
  )
  expect(await general.execute({ query: "test" }, searchContext)).toEqual({
    query: "test",
    results: [],
  })
})
