import { describe, expect, test } from "bun:test"

import { consumeDurableTurn } from "./eve-stream-consume"

async function* events<T>(values: T[]) {
  for (const value of values) yield value
}

describe("consumeDurableTurn", () => {
  test("keeps reopening an unfinished turn beyond four exhausted iterators", async () => {
    let reopens = 0
    const seen: string[] = []
    const result = await consumeDurableTurn({
      initialStream: events(["started"]),
      reopen: () => {
        reopens += 1
        return reopens === 5 ? events(["done"]) : events([])
      },
      isBoundary: (event) => event === "done",
      onEvent: (event) => {
        seen.push(event)
      },
    })

    expect(result).toEqual({ settled: true, received: 2 })
    expect(reopens).toBe(5)
    expect(seen).toEqual(["started", "done"])
  })

  test("stops reopening after an explicit abort", async () => {
    const ac = new AbortController()
    let reopens = 0
    const result = await consumeDurableTurn({
      initialStream: events(["started"]),
      reopen: () => {
        reopens += 1
        ac.abort()
        return events([])
      },
      isBoundary: () => false,
      onEvent: () => {},
      signal: ac.signal,
    })

    expect(result).toEqual({ settled: false, received: 1 })
    expect(reopens).toBe(1)
  })
})
