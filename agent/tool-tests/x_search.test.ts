import { afterEach, describe, expect, mock, test } from "bun:test"
import { APICallError } from "@ai-sdk/provider"

import { createXSearchTool, type XSearchDependencies } from "../tools/x_search"

const originalKey = process.env.XAI_API_KEY
const originalError = console.error

afterEach(() => {
  if (originalKey === undefined) delete process.env.XAI_API_KEY
  else process.env.XAI_API_KEY = originalKey
  console.error = originalError
})

function apiError(statusCode: number) {
  return new APICallError({
    message: "provider failed for team secret-team",
    url: "https://api.x.ai/v1/responses?credential=secret",
    requestBodyValues: { query: "private query", apiKey: "test-api-key-value" },
    statusCode,
    responseBody: "private response body for secret-team",
    responseHeaders: { authorization: "Bearer secret-key" },
    isRetryable: false,
  })
}

function toolWith({
  generateText,
  getTweet = async (id: string) => ({
    text: `tweet ${id}`,
    user: { screen_name: `user${id}` },
  }),
}: {
  generateText: XSearchDependencies["generateText"]
  getTweet?: (id: string) => Promise<{
    text?: string | null
    user?: { screen_name?: string | null } | null
  } | null>
}) {
  return createXSearchTool({ generateText, getTweet }) as unknown as {
    execute: (
      input: { queries: string[] },
      context: unknown
    ) => Promise<Record<string, unknown>>
  }
}

const toolContext = {}

describe("x_search failure boundary", () => {
  test("returns a safe error when xAI is not configured", async () => {
    delete process.env.XAI_API_KEY
    const generateText = mock(async () => ({ sources: [] }))
    const result = await toolWith({ generateText }).execute({ queries: ["one"] }, toolContext)

    expect(result).toEqual({
      queries: ["one"],
      error: "X search is unavailable because it is not configured.",
      results: [],
    })
    expect(generateText).not.toHaveBeenCalled()
  })

  test("classifies 403 failures without exposing provider details", async () => {
    process.env.XAI_API_KEY = "configured"
    const logEntries: unknown[][] = []
    console.error = (...args) => logEntries.push(args)
    const result = await toolWith({
      generateText: async () => {
        throw apiError(403)
      },
    }).execute({ queries: ["private query"] }, toolContext)

    expect(result.error).toBe(
      "X search is unavailable because the configured xAI account cannot authorize requests or has reached its usage limit."
    )
    expect(result.results).toEqual([])
    const serializedResult = JSON.stringify(result)
    for (const secret of [
      "secret-team",
      "secret-key",
      "private response body",
      "api.x.ai",
      "authorization",
    ]) {
      expect(serializedResult).not.toContain(secret)
    }
    const serializedLogs = JSON.stringify(logEntries)
    for (const secret of [
      "secret-team",
      "secret-key",
      "private response body",
      "api.x.ai",
      "private query",
    ]) {
      expect(serializedLogs).not.toContain(secret)
    }
    expect(logEntries).toEqual([
      ["x_search provider failure", { queryCount: 1, status: "authorization" }],
    ])
  })

  test("uses a generic error for other provider failures", async () => {
    process.env.XAI_API_KEY = "configured"
    console.error = () => undefined
    const result = await toolWith({
      generateText: async () => {
        throw new Error("socket failed with private details")
      },
    }).execute({ queries: ["one"] }, toolContext)

    expect(result.error).toBe("X search is temporarily unavailable.")
    expect(result.results).toEqual([])
  })

  test("preserves successful results when another query fails", async () => {
    process.env.XAI_API_KEY = "configured"
    console.error = () => undefined
    let calls = 0
    const result = await toolWith({
      generateText: async () => {
        calls += 1
        if (calls === 2) throw apiError(403)
        return {
          sources: [
            { sourceType: "url", url: "https://x.com/user/status/123" },
          ],
        }
      },
    }).execute({ queries: ["one", "two"] }, toolContext)

    expect(result.error).toBe(
      "X search is unavailable because the configured xAI account cannot authorize requests or has reached its usage limit."
    )
    expect(result.results).toEqual([
      {
        title: "@user123",
        url: "https://x.com/user123/status/123",
        text: "tweet 123",
      },
    ])
  })

  test("deduplicates all-success results without an error", async () => {
    process.env.XAI_API_KEY = "configured"
    const result = await toolWith({
      generateText: async () => ({
        sources: [
          { sourceType: "url", url: "https://x.com/a/status/123" },
          { sourceType: "url", url: "https://x.com/b/status/123" },
          { sourceType: "url", url: "https://x.com/c/status/456" },
        ],
      }),
    }).execute({ queries: ["one", "two"] }, toolContext)

    expect(result).not.toHaveProperty("error")
    expect(result.results).toEqual([
      {
        title: "@user123",
        url: "https://x.com/user123/status/123",
        text: "tweet 123",
      },
      {
        title: "@user456",
        url: "https://x.com/user456/status/456",
        text: "tweet 456",
      },
    ])
  })
})
