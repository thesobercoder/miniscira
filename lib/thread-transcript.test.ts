import { describe, expect, test } from "bun:test"

import type { ChatEvent } from "@/lib/chat-events"
import {
  boundVisibleThreadMessages,
  projectVisibleThreadMessages,
  THREAD_READ_CHARACTER_LIMIT,
} from "@/lib/thread-transcript"

const submitted = (message: string, submissionId: string): ChatEvent => ({
  type: "client.message.submitted",
  data: { createdAt: 0, message, submissionId },
})

describe("projectVisibleThreadMessages", () => {
  test("projects visible user text and excludes client lifecycle payloads", () => {
    const messages = projectVisibleThreadMessages([
      submitted("Visible question", "sub_1"),
      {
        type: "client.message.failed",
        data: { submissionId: "sub_2" },
      } as ChatEvent,
    ])
    expect(messages.map((message) => message.text)).toEqual([
      "Visible question",
    ])
  })

  test("hides messages named by a persisted supersede marker", () => {
    const messages = projectVisibleThreadMessages([
      submitted("Old question", "sub_1"),
      { type: "client.superseded", ids: ["optimistic:sub_1:user"] },
    ])
    expect(messages).toEqual([])
  })

  test("excludes assistant text from failed or unfinished turns", () => {
    const messages = projectVisibleThreadMessages([
      {
        type: "message.received",
        data: {
          turnId: "turn_1",
          createdAt: 1,
          message: "Visible question",
          parts: [{ type: "text", text: "Visible question" }],
        },
      } as unknown as ChatEvent,
      {
        type: "text.appended",
        data: {
          turnId: "turn_1",
          stepIndex: 0,
          textDelta: "Partial answer that later failed",
          textSoFar: "Partial answer that later failed",
        },
      } as unknown as ChatEvent,
      {
        type: "turn.failed",
        data: { turnId: "turn_1", error: { message: "model failed" } },
      } as unknown as ChatEvent,
    ])

    expect(messages.map((message) => message.text)).toEqual([
      "Visible question",
    ])
  })
})

describe("boundVisibleThreadMessages", () => {
  test("returns the newest messages with an older continuation cursor", () => {
    const messages = Array.from({ length: 105 }, (_, index) => ({
      id: String(index),
      role: "user" as const,
      text: `message ${index}`,
    }))
    const result = boundVisibleThreadMessages(messages)
    expect(result.messages).toHaveLength(100)
    expect(result.messages[0]?.id).toBe("5")
    expect(result.nextBefore).toBe(5)
  })

  test("caps returned visible characters", () => {
    const result = boundVisibleThreadMessages([
      {
        id: "one",
        role: "assistant",
        text: `start-${"x".repeat(THREAD_READ_CHARACTER_LIMIT + 10)}`,
      },
    ])
    expect(result.messages[0]?.text).toHaveLength(THREAD_READ_CHARACTER_LIMIT)
    expect(result.messages[0]?.text.startsWith("start-")).toBe(true)
    expect(result.messages[0]?.truncated).toBe(true)
  })
})
