import { afterEach, describe, expect, mock, test } from "bun:test"

import {
  browserIsOnChat,
  chatPath,
  navigateToNewResearch,
  replaceWithChatPath,
} from "./chat-route"

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

  test("detects the visible chat URL after history-only promotion", () => {
    globalThis.window = {
      location: { pathname: "/chat/chat-123" },
    } as unknown as Window & typeof globalThis

    expect(browserIsOnChat("chat-123")).toBe(true)
    expect(browserIsOnChat("another-chat")).toBe(false)
  })

  test("uses a document navigation for a fresh research page", () => {
    const assign = mock(() => {})
    globalThis.window = {
      location: { assign },
    } as unknown as Window & typeof globalThis

    navigateToNewResearch()

    expect(assign).toHaveBeenCalledTimes(1)
    expect(assign).toHaveBeenCalledWith("/")
  })
})
