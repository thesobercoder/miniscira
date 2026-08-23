import { describe, expect, test } from "bun:test"

import type { McpServer } from "@/lib/db/schema"
import {
  OAUTH_ATTEMPT_MAX_AGE_MS,
  oauthAttemptIsActive,
  oauthRedirectUrl,
  serverIdFromState,
} from "@/lib/mcp-oauth"

function row(overrides: Partial<McpServer> = {}): McpServer {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    userId: "user_1",
    name: "example",
    url: "https://mcp.example.com/mcp",
    transport: "http",
    authType: "oauth",
    headers: null,
    oauthClient: null,
    oauthTokens: null,
    oauthVerifier: null,
    oauthState: null,
    oauthCallbackMode: "automatic",
    oauthCallbackUrl: null,
    oauthAttemptCallbackUrl: null,
    oauthAttemptStartedAt: null,
    enabled: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }
}

describe("MCP OAuth callback selection", () => {
  test("uses the deployment callback by default", () => {
    process.env.APP_URL = "http://umbrel.local:8325"
    expect(oauthRedirectUrl(row())).toBe(
      "http://umbrel.local:8325/api/mcp/oauth/callback"
    )
  })

  test("uses the configured manual callback", () => {
    expect(
      oauthRedirectUrl(
        row({
          oauthCallbackMode: "manual",
          oauthCallbackUrl: "http://localhost:33418/callback",
        })
      )
    ).toBe("http://localhost:33418/callback")
  })

  test("freezes the callback selected for an active attempt", () => {
    expect(
      oauthRedirectUrl(
        row({
          oauthCallbackMode: "manual",
          oauthCallbackUrl: "http://localhost:33418/new",
          oauthAttemptCallbackUrl: "http://localhost:33418/original",
        })
      )
    ).toBe("http://localhost:33418/original")
  })

  test("extracts only UUID server ids from state", () => {
    expect(
      serverIdFromState("11111111-1111-1111-1111-111111111111.random")
    ).toBe("11111111-1111-1111-1111-111111111111")
    expect(serverIdFromState("not-a-server.random")).toBeNull()
  })
})

describe("MCP OAuth attempt expiry", () => {
  const now = Date.now()

  test("accepts current attempts and the exact expiry boundary", () => {
    expect(oauthAttemptIsActive(new Date(now), now)).toBe(true)
    expect(
      oauthAttemptIsActive(new Date(now - OAUTH_ATTEMPT_MAX_AGE_MS), now)
    ).toBe(true)
  })

  test("rejects missing, expired, and future attempts", () => {
    expect(oauthAttemptIsActive(null, now)).toBe(false)
    expect(
      oauthAttemptIsActive(new Date(now - OAUTH_ATTEMPT_MAX_AGE_MS - 1), now)
    ).toBe(false)
    expect(oauthAttemptIsActive(new Date(now + 1), now)).toBe(false)
  })
})
