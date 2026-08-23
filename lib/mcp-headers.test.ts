import { describe, expect, test } from "bun:test"

import { sanitizeMcpHeaders } from "@/lib/mcp-headers"

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
