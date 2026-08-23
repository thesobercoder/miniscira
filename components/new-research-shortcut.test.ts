import { describe, expect, test } from "bun:test"
import { isNewResearchShortcut } from "./new-research-shortcut"

function keyEvent(
  overrides: Partial<Parameters<typeof isNewResearchShortcut>[0]> = {}
) {
  return {
    altKey: false,
    ctrlKey: true,
    defaultPrevented: false,
    key: "o",
    metaKey: false,
    repeat: false,
    shiftKey: true,
    ...overrides,
  }
}

describe("new research shortcut", () => {
  test("accepts Ctrl+Shift+O and Cmd+Shift+O", () => {
    expect(isNewResearchShortcut(keyEvent())).toBe(true)
    expect(
      isNewResearchShortcut(
        keyEvent({ ctrlKey: false, key: "O", metaKey: true })
      )
    ).toBe(true)
  })

  test("rejects incomplete or conflicting combinations", () => {
    expect(isNewResearchShortcut(keyEvent({ shiftKey: false }))).toBe(false)
    expect(isNewResearchShortcut(keyEvent({ ctrlKey: false }))).toBe(false)
    expect(isNewResearchShortcut(keyEvent({ altKey: true }))).toBe(false)
    expect(isNewResearchShortcut(keyEvent({ repeat: true }))).toBe(false)
    expect(isNewResearchShortcut(keyEvent({ defaultPrevented: true }))).toBe(
      false
    )
  })
})
