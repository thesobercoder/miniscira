import { describe, expect, test } from "bun:test"

import {
  clearThreadSearchGrant,
  hasThreadSearchGrant,
  replaceThreadSearchGrant,
  threadSearchGrantKey,
} from "@/agent/thread-search-grants"

describe("thread search grants", () => {
  test("ties returned IDs to one user and root session", () => {
    const key = threadSearchGrantKey("user-a", "session-a")
    replaceThreadSearchGrant(key, ["thread-a"])
    expect(hasThreadSearchGrant(key, "thread-a")).toBe(true)
    expect(
      hasThreadSearchGrant(
        threadSearchGrantKey("user-a", "session-b"),
        "thread-a"
      )
    ).toBe(false)
    expect(
      hasThreadSearchGrant(
        threadSearchGrantKey("user-b", "session-a"),
        "thread-a"
      )
    ).toBe(false)
    clearThreadSearchGrant(key)
  })

  test("a new search replaces the previous candidate set", () => {
    const key = threadSearchGrantKey("user", "session")
    replaceThreadSearchGrant(key, ["old"])
    replaceThreadSearchGrant(key, ["new"])
    expect(hasThreadSearchGrant(key, "old")).toBe(false)
    expect(hasThreadSearchGrant(key, "new")).toBe(true)
    clearThreadSearchGrant(key)
  })
})
