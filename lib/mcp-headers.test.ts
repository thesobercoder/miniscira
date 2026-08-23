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
  test("allows no header when authentication is optional", () => {
    expect(validateMcpHeaders(null)).toBeNull()
  })

  test("rejects no header when header authentication was selected", () => {
    expect(validateMcpHeaders(null, { required: true })).toBe(
      "Authentication header is required."
    )
  })

  test("accepts a complete bearer authorization value", () => {
    expect(validateMcpHeaders({ Authorization: "Bearer token" })).toBeNull()
  })

  test("accepts bearer case-insensitively", () => {
    expect(validateMcpHeaders({ authorization: "bearer token" })).toBeNull()
  })

  test("rejects an authorization token without a scheme", () => {
    expect(validateMcpHeaders({ Authorization: "token" })).toBe(
      "Authorization must be Bearer followed by a token."
    )
  })

  test("rejects Bearer without a token", () => {
    expect(validateMcpHeaders({ Authorization: "Bearer" })).toBe(
      "Authorization must be Bearer followed by a token."
    )
  })

  test("rejects an empty bearer token", () => {
    expect(validateMcpHeaders({ Authorization: "Bearer   " })).toBe(
      "Authorization must be Bearer followed by a token."
    )
  })

  test("rejects a non-bearer authorization scheme", () => {
    expect(validateMcpHeaders({ Authorization: "Token value" })).toBe(
      "Authorization must be Bearer followed by a token."
    )
  })

  test("rejects whitespace within the token", () => {
    expect(validateMcpHeaders({ Authorization: "Bearer token value" })).toBe(
      "Authorization must be Bearer followed by a token."
    )
  })

  test("rejects multiple bearer credentials", () => {
    expect(validateMcpHeaders({ Authorization: "Bearer one,two" })).toBe(
      "Authorization must be Bearer followed by a token."
    )
  })

  test("accepts custom API key headers", () => {
    expect(validateMcpHeaders({ "X-API-Key": "token" })).toBeNull()
  })
})
