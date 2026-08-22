import { describe, expect, test } from "bun:test"

import { lookoutRecipient } from "./lookout-recipient"

describe("lookoutRecipient", () => {
  test("returns the owner's normalized signup email", () => {
    expect(lookoutRecipient("  User@Example.com ")).toBe("User@Example.com")
  })

  test("does not use a configured global override", () => {
    process.env.LOOKOUT_EMAIL_TO = "override@example.com"
    expect(lookoutRecipient("owner@example.com")).toBe("owner@example.com")
    delete process.env.LOOKOUT_EMAIL_TO
  })

  test("returns null when the account has no usable signup email", () => {
    expect(lookoutRecipient(null)).toBeNull()
    expect(lookoutRecipient("   ")).toBeNull()
  })
})
