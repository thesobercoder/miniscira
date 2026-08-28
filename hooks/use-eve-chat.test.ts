import { describe, expect, test } from "bun:test"
import { drainUntilBoundary, shouldForgetSession } from "@/hooks/use-eve-chat"
import type { ChatEvent } from "@/lib/chat-events"
import { consumeDurableTurn } from "@/lib/eve-stream-consume"

const response = { turnId: "turn_1" }

describe("shouldForgetSession", () => {
  test("keeps the session when the server never answered", () => {
    expect(
      shouldForgetSession({ response: null, followed: false, hadSession: true })
    ).toBe(false)
  })

  test("forgets the session when the server answered but produced no turn", () => {
    expect(
      shouldForgetSession({ response, followed: false, hadSession: true })
    ).toBe(true)
  })

  test("keeps the session when the turn was followed", () => {
    expect(
      shouldForgetSession({ response, followed: true, hadSession: true })
    ).toBe(false)
  })

  test("has nothing to forget with no prior session", () => {
    expect(
      shouldForgetSession({
        response: null,
        followed: false,
        hadSession: false,
      })
    ).toBe(false)
    expect(
      shouldForgetSession({ response, followed: false, hadSession: false })
    ).toBe(false)
  })
})

const event = (type: string) => ({ type }) as unknown as ChatEvent

describe("drainUntilBoundary", () => {
  test("stops at the boundary even when the stream stays open", async () => {
    // The bug this exists for: eve leaves a durable session's stream open after
    // `session.completed`, so a drain that waits for the iterator to return
    // never returns, and the composer stays stuck in its streaming state on a
    // turn that has already finished answering. `never` models that open tail.
    let reachedTail = false
    async function* openAfterCompletion() {
      yield event("message.part.delta")
      yield event("session.completed")
      reachedTail = true
      await new Promise(() => {}) // never resolves, like a live session
    }

    const seen: string[] = []
    const result = await drainUntilBoundary(openAfterCompletion(), (e) =>
      seen.push((e as { type: string }).type)
    )

    expect(result).toEqual({ settled: true, received: 2 })
    expect(seen).toEqual(["message.part.delta", "session.completed"])
    expect(reachedTail).toBe(false)
  })

  test("reports the boundary for each kind eve ends a turn with", async () => {
    for (const type of [
      "session.completed",
      "session.failed",
      "session.waiting",
    ]) {
      async function* one() {
        yield event(type)
      }
      expect(await drainUntilBoundary(one(), () => {})).toEqual({
        settled: true,
        received: 1,
      })
    }
  })

  test("a stream that ends without a boundary is not settled", async () => {
    // The turn is still running server-side; the caller re-attaches rather than
    // reporting the answer as finished.
    async function* endsEarly() {
      yield event("step.started")
      yield event("message.part.delta")
    }
    expect(await drainUntilBoundary(endsEarly(), () => {})).toEqual({
      settled: false,
      received: 2,
    })
  })

  test("client projection events are never boundaries", async () => {
    async function* clientOnly() {
      yield event("client.message.submitted")
      yield event("client.input.responded")
    }
    expect(await drainUntilBoundary(clientOnly(), () => {})).toEqual({
      settled: false,
      received: 2,
    })
  })
})

describe("consumeDurableTurn", () => {
  test("waits for asynchronous event work before reading the next event", async () => {
    const calls: string[] = []
    async function* two() {
      calls.push("yield:first")
      yield event("message.part.delta")
      calls.push("yield:second")
      yield event("session.completed")
    }

    await consumeDurableTurn({
      initialStream: two(),
      reopen: two,
      isBoundary: (item) => item.type === "session.completed",
      onEvent: async (item) => {
        await Promise.resolve()
        calls.push(`handled:${item.type}`)
      },
    })

    expect(calls).toEqual([
      "yield:first",
      "handled:message.part.delta",
      "yield:second",
      "handled:session.completed",
    ])
  })
})
