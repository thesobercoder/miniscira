import { afterEach, describe, expect, test } from "bun:test"

import { configuredLimit, rateLimit, resetRateLimits } from "@/lib/rate-limit"

const withLimit = (value: string | undefined, fn: () => void) => {
  const previous = process.env.RATE_LIMIT_PER_MINUTE
  if (value === undefined) delete process.env.RATE_LIMIT_PER_MINUTE
  else process.env.RATE_LIMIT_PER_MINUTE = value
  try {
    fn()
  } finally {
    if (previous === undefined) delete process.env.RATE_LIMIT_PER_MINUTE
    else process.env.RATE_LIMIT_PER_MINUTE = previous
  }
}

afterEach(resetRateLimits)

describe("configuredLimit", () => {
  test("off unless set to a positive integer", () => {
    withLimit(undefined, () => expect(configuredLimit()).toBeNull())
    withLimit("", () => expect(configuredLimit()).toBeNull())
    withLimit("0", () => expect(configuredLimit()).toBeNull())
    withLimit("-5", () => expect(configuredLimit()).toBeNull())
    withLimit("nonsense", () => expect(configuredLimit()).toBeNull())
    withLimit("60", () => expect(configuredLimit()).toBe(60))
  })
})

describe("rateLimit", () => {
  test("allows everything when disabled", () => {
    withLimit(undefined, () => {
      for (let i = 0; i < 500; i++)
        expect(rateLimit("user-1").allowed).toBe(true)
    })
  })

  test("allows exactly the budget, then rejects", () => {
    withLimit("3", () => {
      const now = 1_000_000
      expect(rateLimit("user-1", now).allowed).toBe(true)
      expect(rateLimit("user-1", now).allowed).toBe(true)
      expect(rateLimit("user-1", now).allowed).toBe(true)
      expect(rateLimit("user-1", now).allowed).toBe(false)
    })
  })

  test("counts each principal separately", () => {
    withLimit("1", () => {
      const now = 1_000_000
      expect(rateLimit("user-1", now).allowed).toBe(true)
      expect(rateLimit("user-1", now).allowed).toBe(false)
      // A second user must be unaffected by the first one's spending.
      expect(rateLimit("user-2", now).allowed).toBe(true)
    })
  })

  test("the window reopens", () => {
    withLimit("1", () => {
      const now = 1_000_000
      expect(rateLimit("user-1", now).allowed).toBe(true)
      expect(rateLimit("user-1", now + 59_000).allowed).toBe(false)
      expect(rateLimit("user-1", now + 60_000).allowed).toBe(true)
    })
  })

  test("retry-after is never zero", () => {
    withLimit("1", () => {
      const now = 1_000_000
      rateLimit("user-1", now)
      // 999ms left rounds down to 0s, which would invite an instant retry
      // into the same closed window.
      const verdict = rateLimit("user-1", now + 59_999)
      expect(verdict.allowed).toBe(false)
      if (!verdict.allowed) expect(verdict.retryAfterSeconds).toBe(1)
    })
  })
})
