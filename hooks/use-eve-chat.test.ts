import { describe, expect, test } from "bun:test"
import {
  createOperationId,
  cursorForTurn,
  drainUntilBoundary,
  initialCursorForEvents,
  shouldForgetSession,
  shouldResumeStream,
} from "@/hooks/use-eve-chat"
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

describe("shouldResumeStream", () => {
  const session = { sessionId: "ses_new", streamIndex: 4 }

  test("reattaches when the persisted tail is still active", () => {
    expect(shouldResumeStream([event("message.appended")], session)).toBe(true)
  })

  test("reattaches across the cursor-before-first-event crash gap", () => {
    expect(
      shouldResumeStream([event("session.waiting")], {
        sessionId: "ses_new",
        streamIndex: 0,
      })
    ).toBe(true)
  })

  test("does not reopen an already settled persisted session", () => {
    expect(shouldResumeStream([event("session.waiting")], session)).toBe(false)
  })
})

describe("initialCursorForEvents", () => {
  const session = {
    sessionId: "session-1",
    continuationToken: "continuation-1",
    streamIndex: 42,
  }

  test("preserves a valid session after a settled turn", () => {
    expect(initialCursorForEvents([event("session.waiting")], session)).toBe(
      session
    )
    expect(
      initialCursorForEvents(
        [event("session.waiting"), event("client.message.superseded")],
        session
      )
    ).toBe(session)
  })

  test("keeps the cursor only while a server turn is in flight", () => {
    expect(
      initialCursorForEvents([event("message.appended")], session)
    ).toBe(session)
    expect(initialCursorForEvents([], session)).toBe(session)
  })
})

describe("createOperationId", () => {
  test("falls back to getRandomValues when randomUUID is unavailable", () => {
    const source = {
      getRandomValues: (bytes: Uint8Array) => {
        bytes.set(Array.from({ length: 16 }, (_, index) => index))
        return bytes
      },
    }
    expect(createOperationId(source)).toBe(
      "00010203-0405-4607-8809-0a0b0c0d0e0f"
    )
  })
})

describe("cursorForTurn", () => {
  test("keeps the per-session index for a continuation", () => {
    expect(
      cursorForTurn(
        { sessionId: "same", continuationToken: "old", streamIndex: 42 },
        { sessionId: "same", continuationToken: "new" }
      )
    ).toEqual({
      sessionId: "same",
      continuationToken: "new",
      streamIndex: 42,
    })
  })

  test("starts a replacement session at index zero", () => {
    expect(
      cursorForTurn(
        { sessionId: "old", continuationToken: "old", streamIndex: 42 },
        { sessionId: "replacement", continuationToken: "new" }
      )
    ).toEqual({
      sessionId: "replacement",
      continuationToken: "new",
      streamIndex: 0,
    })
  })
})

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
