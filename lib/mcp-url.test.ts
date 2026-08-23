import { describe, expect, test } from "bun:test"

import {
  sameCallbackTarget,
  validateMcpCallbackUrl,
  validateMcpServerUrl,
} from "@/lib/mcp-url"

describe("MCP URL policy", () => {
  test("accepts HTTP and HTTPS MCP endpoints on self-hosted names", () => {
    expect(validateMcpServerUrl("http://umbrel.local:9001/mcp").ok).toBe(true)
    expect(validateMcpServerUrl("http://192.168.1.20:9001/mcp").ok).toBe(true)
    expect(validateMcpServerUrl("https://mcp.example.com/mcp").ok).toBe(true)
  })

  test("marks HTTP as insecure and rejects unsafe URL forms", () => {
    expect(validateMcpServerUrl("http://mcp.internal/mcp")).toMatchObject({
      ok: true,
      insecure: true,
    })
    expect(validateMcpServerUrl("file:///tmp/mcp").ok).toBe(false)
    expect(validateMcpServerUrl("https://user:pass@mcp.example/mcp").ok).toBe(
      false
    )
    expect(validateMcpServerUrl("https://mcp.example/mcp#secret").ok).toBe(
      false
    )
  })

  test("accepts exact provider callback URLs over HTTP or HTTPS", () => {
    expect(validateMcpCallbackUrl("http://localhost:33418/callback").ok).toBe(
      true
    )
    expect(validateMcpCallbackUrl("http://umbrel.local:8325/callback").ok).toBe(
      true
    )
    expect(validateMcpCallbackUrl("https://mini.example/callback").ok).toBe(
      true
    )
  })

  test("matches callback origin and path while allowing provider query values", () => {
    expect(
      sameCallbackTarget(
        "http://localhost:33418/api/mcp/callback",
        new URL("http://localhost:33418/api/mcp/callback?code=one&state=two")
      )
    ).toBe(true)
    expect(
      sameCallbackTarget(
        "http://localhost:33418/api/mcp/callback",
        new URL("http://localhost:33419/api/mcp/callback?code=one&state=two")
      )
    ).toBe(false)
    expect(
      sameCallbackTarget(
        "http://localhost:33418/api/mcp/callback",
        new URL("http://localhost:33418/other?code=one&state=two")
      )
    ).toBe(false)
  })
})
