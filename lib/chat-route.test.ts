import { describe, expect, test } from "bun:test"

import { chatPath } from "./chat-route"

describe("new-chat route promotion", () => {
  test("builds the durable URL from the created chat id", () => {
    expect(chatPath("chat-123")).toBe("/chat/chat-123")
  })
})
