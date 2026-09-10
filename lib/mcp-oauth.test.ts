import { describe, expect, test } from "bun:test"

import { oauthRedirectUrl, serverIdFromState } from "@/lib/mcp-oauth"

describe("MCP OAuth callback selection", () => {
  test("uses the deployment callback", () => {
    process.env.APP_URL = "http://homelab.local:8325"
    expect(oauthRedirectUrl()).toBe(
      "http://homelab.local:8325/api/mcp/oauth/callback"
    )
  })

  test("extracts only UUID server ids from state", () => {
    expect(
      serverIdFromState("11111111-1111-1111-1111-111111111111.random")
    ).toBe("11111111-1111-1111-1111-111111111111")
    expect(serverIdFromState("not-a-server.random")).toBeNull()
  })
})
