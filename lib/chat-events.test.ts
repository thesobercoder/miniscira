import { describe, expect, test } from "bun:test"

import {
  type ChatEvent,
  eventId,
  eventType,
  isClientEvent,
  scopeSessions,
} from "@/lib/chat-events"

const meta = { at: "2026-07-31T00:00:00.000Z", id: "evt_1" }

const supersede: ChatEvent = {
  type: "client.superseded",
  ids: ["a", "b"],
}

const inputResponded: ChatEvent = {
  type: "client.input.responded",
  data: { createdAt: 0, responses: [] },
}

const messageSubmitted: ChatEvent = {
  type: "client.message.submitted",
  data: { createdAt: 0, message: "hi", submissionId: "sub_1" },
}

const messageFailed: ChatEvent = {
  type: "client.message.failed",
  data: {
    createdAt: 0,
    error: { message: "boom" },
    message: "hi",
    submissionId: "sub_1",
  },
}

const sessionStarted: ChatEvent = { type: "session.started", data: {}, meta }

const turnStarted = (turnId: string): ChatEvent => ({
  type: "turn.started",
  data: { sequence: 0, turnId },
  meta,
})

describe("eventId", () => {
  test("reads the server's stable id off a stream event", () => {
    expect(eventId(sessionStarted)).toBe("evt_1")
    expect(eventId(turnStarted("turn_0"))).toBe("evt_1")
  })

  test("is undefined for locally generated projection events", () => {
    // These have no `meta`, and each one is genuinely new — deduping them by
    // identity would drop real submissions.
    expect(eventId(supersede)).toBeUndefined()
    expect(eventId(messageSubmitted)).toBeUndefined()
    expect(eventId(inputResponded)).toBeUndefined()
  })

  test("is undefined when meta carries no usable id", () => {
    expect(
      eventId({ type: "session.started", data: {}, meta: {} } as ChatEvent)
    ).toBeUndefined()
    expect(
      eventId({
        type: "session.started",
        data: {},
        meta: { id: 7 },
      } as unknown as ChatEvent)
    ).toBeUndefined()
  })
})

describe("isClientEvent", () => {
  test("is true for every client projection event the module enumerates", () => {
    expect(isClientEvent(supersede)).toBe(true)
    expect(isClientEvent(inputResponded)).toBe(true)
    expect(isClientEvent(messageSubmitted)).toBe(true)
    expect(isClientEvent(messageFailed)).toBe(true)
  })

  test("is false for a server event", () => {
    expect(isClientEvent(sessionStarted)).toBe(false)
    expect(isClientEvent(turnStarted("turn_0"))).toBe(false)
  })
})

describe("eventType", () => {
  test("returns the type of a well-formed event", () => {
    expect(eventType(sessionStarted)).toBe("session.started")
    expect(eventType(supersede)).toBe("client.superseded")
  })

  test("returns the empty string for an object with no type", () => {
    expect(eventType({} as ChatEvent)).toBe("")
  })

  // characterization: the plan expected `eventType(null)` not to throw, but the
  // implementation reads `.type` off the argument unguarded, so a nullish event
  // raises a TypeError. Asserting current behavior; not changing the code.
  test("throws on a nullish event", () => {
    expect(() => eventType(null as unknown as ChatEvent)).toThrow(TypeError)
    expect(() => eventType(undefined as unknown as ChatEvent)).toThrow(
      TypeError
    )
  })
})

describe("scopeSessions", () => {
  test("groups turn ids per session and reports the last session index", () => {
    const log: ChatEvent[] = [
      sessionStarted,
      turnStarted("turn_0"),
      turnStarted("turn_1"),
      sessionStarted,
      turnStarted("turn_0"),
    ]

    const { events, lastSession } = scopeSessions(log)

    expect(lastSession).toBe(1)
    expect(events.map(eventType)).toEqual([
      "session.started",
      "turn.started",
      "turn.started",
      "session.started",
      "turn.started",
    ])

    const turnIds = events.map(
      (event) => (event as { data?: { turnId?: string } }).data?.turnId
    )
    // Session 0 keeps eve's original ids; session 1 is prefixed so its
    // `turn_0` does not merge into session 0's `turn_0`.
    expect(turnIds).toEqual([
      undefined,
      "turn_0",
      "turn_1",
      undefined,
      "s1:turn_0",
    ])
  })

  test("leaves a single-session log untouched", () => {
    const log: ChatEvent[] = [sessionStarted, turnStarted("turn_0")]
    const { events, lastSession } = scopeSessions(log)
    expect(lastSession).toBe(0)
    expect(events).toEqual(log)
  })
})
