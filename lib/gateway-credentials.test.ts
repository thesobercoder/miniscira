import { afterEach, describe, expect, test } from "bun:test"

import { userGatewayKeysEnabled } from "@/lib/gateway-credentials"

const originalShared = process.env.ALLOW_SHARED_GATEWAY_KEY
const originalKey = process.env.AI_GATEWAY_API_KEY

afterEach(() => {
  if (originalShared === undefined) delete process.env.ALLOW_SHARED_GATEWAY_KEY
  else process.env.ALLOW_SHARED_GATEWAY_KEY = originalShared

  if (originalKey === undefined) delete process.env.AI_GATEWAY_API_KEY
  else process.env.AI_GATEWAY_API_KEY = originalKey
})

describe("userGatewayKeysEnabled", () => {
  test("hides BYOK controls when a shared deployment key is active", () => {
    process.env.ALLOW_SHARED_GATEWAY_KEY = "true"
    process.env.AI_GATEWAY_API_KEY = "configured"

    expect(userGatewayKeysEnabled()).toBe(false)
  })

  test("keeps BYOK controls when shared-key fallback is disabled", () => {
    process.env.ALLOW_SHARED_GATEWAY_KEY = "false"
    process.env.AI_GATEWAY_API_KEY = "configured"

    expect(userGatewayKeysEnabled()).toBe(true)
  })

  test("keeps BYOK controls when no deployment key exists", () => {
    process.env.ALLOW_SHARED_GATEWAY_KEY = "true"
    delete process.env.AI_GATEWAY_API_KEY

    expect(userGatewayKeysEnabled()).toBe(true)
  })
})