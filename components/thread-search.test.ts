import { describe, expect, test } from "bun:test"

import { isThreadSearchShortcut } from "@/components/thread-search"

const event = (
  overrides: Partial<Parameters<typeof isThreadSearchShortcut>[0]> = {}
) => ({
  altKey: false,
  ctrlKey: true,
  defaultPrevented: false,
  key: "k",
  metaKey: false,
  repeat: false,
  shiftKey: false,
  ...overrides,
})

describe("isThreadSearchShortcut", () => {
  test("accepts Control+K and Meta+K", () => {
    expect(isThreadSearchShortcut(event())).toBe(true)
    expect(
      isThreadSearchShortcut(event({ ctrlKey: false, metaKey: true }))
    ).toBe(true)
  })

  test("rejects modified, repeated, handled and unrelated keys", () => {
    expect(isThreadSearchShortcut(event({ shiftKey: true }))).toBe(false)
    expect(isThreadSearchShortcut(event({ repeat: true }))).toBe(false)
    expect(isThreadSearchShortcut(event({ defaultPrevented: true }))).toBe(
      false
    )
    expect(isThreadSearchShortcut(event({ key: "j" }))).toBe(false)
  })
})
