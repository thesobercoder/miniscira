import { describe, expect, test } from "bun:test"

import { redditQuery } from "./reddit-search"

describe("redditQuery", () => {
  test("restricts SearXNG results to Reddit", () => {
    expect(redditQuery("best self-hosted AI search")).toBe(
      "site:reddit.com best self-hosted AI search"
    )
  })
})
