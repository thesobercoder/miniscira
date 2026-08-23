import { describe, expect, test } from "bun:test"

import { chatPath, chatTurnPath } from "./chat-route"

describe("new-chat route promotion", () => {
  test("builds the durable URL from the created chat id", () => {
    expect(chatPath("chat-123")).toBe("/chat/chat-123")
  })

  test("carries a first turn through the canonical chat route", () => {
    expect(chatTurnPath("chat/123", "why & how?", "search")).toBe(
      "/chat/chat%2F123?q=why+%26+how%3F"
    )
    expect(chatTurnPath("chat-123", "investigate", "deep")).toBe(
      "/chat/chat-123?q=investigate&mode=deep"
    )
  })
})
