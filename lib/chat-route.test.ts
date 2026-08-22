import { afterEach, describe, expect, mock, test } from "bun:test"

import { chatPath, replaceWithChatPath } from "./chat-route"

describe("new-chat route promotion", () => {
  const originalWindow = globalThis.window

  afterEach(() => {
    if (originalWindow) globalThis.window = originalWindow
    else Reflect.deleteProperty(globalThis, "window")
  })

  test("builds the durable URL from the created chat id", () => {
    expect(chatPath("chat-123")).toBe("/chat/chat-123")
  })

  test("replaces the top-level URL while preserving Next's history state", () => {
    const state = { __NA: true, tree: ["", {}] }
    const replaceState = mock(() => {})
    globalThis.window = {
      history: { state, replaceState },
    } as unknown as Window & typeof globalThis

    expect(replaceWithChatPath("chat-123")).toBe("/chat/chat-123")
    expect(replaceState).toHaveBeenCalledTimes(1)
    expect(replaceState).toHaveBeenCalledWith(state, "", "/chat/chat-123")
  })
})
