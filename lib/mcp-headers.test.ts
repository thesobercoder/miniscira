import { describe, expect, test } from "bun:test"

import { sanitizeMcpHeaders, validateMcpHeaders } from "@/lib/mcp-headers"

describe("sanitizeMcpHeaders", () => {
  test("keeps an explicit header name", () => {
    expect(sanitizeMcpHeaders({ "X-API-Key": " key " })).toEqual({
      "X-API-Key": "key",
    })
  })

  test("defaults a header value with no name to Authorization", () => {
    expect(sanitizeMcpHeaders({ "": "Bearer token" })).toEqual({
      Authorization: "Bearer token",
    })
  })

  test("does not create a header for an empty value", () => {
    expect(sanitizeMcpHeaders({ "": " " })).toBeNull()
  })
})

describe("validateMcpHeaders", () => {
  test("accepts a complete bearer authorization value", () => {
    expect(validateMcpHeaders({ Authorization: "Bearer token" })).toBeNull()
  })

  test("rejects an authorization token without a scheme", () => {
    expect(validateMcpHeaders({ Authorization: "token" })).toBe(
      "Authorization must include a scheme, such as Bearer followed by your token."
    )
  })

  test("accepts custom API key headers", () => {
    expect(validateMcpHeaders({ "X-API-Key": "token" })).toBeNull()
  })
})
