import { describe, expect, test } from "bun:test"

import type { McpServer } from "@/lib/db/schema"
import { publicServer } from "@/lib/mcp"
import { authActionFor } from "@/lib/mcp-ui"

const DUMMY_SECRET = "dummy-not-a-real-token"

function row(overrides: Partial<McpServer> = {}): McpServer {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    userId: "user_1",
    name: "example",
    url: "https://mcp.example.com/mcp",
    transport: "http",
    authType: "auto",
    headers: null,
    oauthClient: null,
    oauthTokens: null,
    oauthVerifier: null,
    oauthState: null,
    enabled: true,
    createdAt: new Date("2026-07-31T00:00:00.000Z"),
    updatedAt: new Date("2026-07-31T00:00:00.000Z"),
    ...overrides,
  }
}

describe("publicServer", () => {
  test("exposes header names, never header values", () => {
    const result = publicServer(
      row({ headers: { Authorization: `Bearer ${DUMMY_SECRET}` } })
    )
    expect(result.headerNames).toEqual(["Authorization"])
    // The regression-proof assertion: it does not depend on knowing which
    // field a future leak comes back through.
    expect(JSON.stringify(result)).not.toContain(DUMMY_SECRET)
  })

  test("headers: null yields an empty name list", () => {
    expect(publicServer(row({ headers: null })).headerNames).toEqual([])
  })

  test("reports authorization as a boolean without token material", () => {
    const result = publicServer(
      row({
        oauthTokens: {
          access_token: DUMMY_SECRET,
          refresh_token: DUMMY_SECRET,
        },
        oauthClient: { client_secret: DUMMY_SECRET },
        oauthVerifier: DUMMY_SECRET,
        oauthState: DUMMY_SECRET,
      })
    )
    expect(result.authorized).toBe(true)
    expect(result.hasOAuthClient).toBe(true)
    expect(JSON.stringify(result)).not.toContain(DUMMY_SECRET)
  })

  test("exposes the OAuth client id but never its secret", () => {
    const result = publicServer(
      row({
        oauthClient: {
          client_id: "safe-client-id",
          client_secret: DUMMY_SECRET,
        },
      })
    )
    expect(result.oauthClientId).toBe("safe-client-id")
    expect(JSON.stringify(result)).not.toContain(DUMMY_SECRET)
  })

  test("does not leak the owning user id", () => {
    expect(JSON.stringify(publicServer(row()))).not.toContain("user_1")
  })
})

describe("authActionFor", () => {
  test("does not offer OAuth until an OAuth client exists", () => {
    expect(
      authActionFor({
        authorized: false,
        hasOAuthClient: false,
        offersOAuth: false,
      })
    ).toBeNull()
  })

  test("connects with a saved client and disconnects with tokens", () => {
    expect(
      authActionFor({
        authorized: false,
        hasOAuthClient: true,
        offersOAuth: false,
      })
    ).toBe("connect")
    expect(
      authActionFor({
        authorized: true,
        hasOAuthClient: true,
        offersOAuth: true,
      })
    ).toBe("disconnect")
  })

  test("offers dynamic OAuth for catalog servers", () => {
    expect(
      authActionFor({
        authorized: false,
        hasOAuthClient: false,
        offersOAuth: true,
      })
    ).toBe("connect")
  })
})
