import { describe, expect, test } from "bun:test"

import { MCP_CATALOG } from "@/lib/mcp-catalog"

describe("MCP catalog API-key entries", () => {
  test("GitHub tells the add form how to collect its token", () => {
    const github = MCP_CATALOG.find((entry) => entry.slug === "github")

    expect(github).toMatchObject({
      authType: "header",
      headerKey: "Authorization",
      headerPlaceholder: "Bearer <personal access token>",
    })
  })

  test("every header-auth entry defines the header field", () => {
    for (const entry of MCP_CATALOG.filter(
      (candidate) => candidate.authType === "header"
    )) {
      expect(entry.headerKey, entry.slug).toBeTruthy()
      expect(entry.headerPlaceholder, entry.slug).toBeTruthy()
    }
  })
})
