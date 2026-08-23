import { beforeEach, describe, expect, test } from "bun:test"

import {
  openMcpHeaders,
  openMcpJson,
  openMcpSecret,
  sealMcpHeaders,
  sealMcpJson,
  sealMcpSecret,
} from "@/lib/mcp-secrets"

const SECRET = "dummy-not-a-real-credential"

beforeEach(() => {
  process.env.BETTER_AUTH_SECRET = "test-only-auth-secret-with-enough-entropy"
})

describe("MCP credential sealing", () => {
  test("seals and opens text without retaining plaintext", () => {
    const sealed = sealMcpSecret(SECRET)
    expect(sealed).not.toContain(SECRET)
    expect(openMcpSecret(sealed)).toBe(SECRET)
  })

  test("seals every header value", () => {
    const sealed = sealMcpHeaders({ Authorization: `Bearer ${SECRET}` })
    expect(JSON.stringify(sealed)).not.toContain(SECRET)
    expect(openMcpHeaders(sealed)).toEqual({
      Authorization: `Bearer ${SECRET}`,
    })
  })

  test("seals OAuth clients and tokens as one authenticated envelope", () => {
    const sealed = sealMcpJson({ client_id: "client", client_secret: SECRET })
    expect(JSON.stringify(sealed)).not.toContain(SECRET)
    expect(openMcpJson(sealed)).toEqual({
      client_id: "client",
      client_secret: SECRET,
    })
  })

  test("reads legacy plaintext so deployment can migrate it safely", () => {
    expect(openMcpSecret(SECRET)).toBe(SECRET)
    expect(openMcpHeaders({ Authorization: SECRET })).toEqual({
      Authorization: SECRET,
    })
    expect(openMcpJson({ access_token: SECRET })).toEqual({
      access_token: SECRET,
    })
  })

  test("rejects credentials sealed with another deployment secret", () => {
    const sealedHeaders = sealMcpHeaders({ Authorization: SECRET })
    process.env.BETTER_AUTH_SECRET = "another-test-only-auth-secret"
    expect(() => openMcpHeaders(sealedHeaders)).toThrow(
      "Stored MCP credential cannot be decrypted"
    )
  })
})
