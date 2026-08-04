import { describe, expect, test } from "bun:test"

import { shouldForgetSession } from "@/hooks/use-eve-chat"

const response = { turnId: "turn_1" }

describe("shouldForgetSession", () => {
  test("keeps the session when the server never answered", () => {
    expect(
      shouldForgetSession({ response: null, followed: false, hadSession: true })
    ).toBe(false)
  })

  test("forgets the session when the server answered but produced no turn", () => {
    expect(
      shouldForgetSession({ response, followed: false, hadSession: true })
    ).toBe(true)
  })

  test("keeps the session when the turn was followed", () => {
    expect(
      shouldForgetSession({ response, followed: true, hadSession: true })
    ).toBe(false)
  })

  test("has nothing to forget with no prior session", () => {
    expect(
      shouldForgetSession({
        response: null,
        followed: false,
        hadSession: false,
      })
    ).toBe(false)
    expect(
      shouldForgetSession({ response, followed: false, hadSession: false })
    ).toBe(false)
  })
})
