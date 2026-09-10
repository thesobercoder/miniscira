import { describe, expect, test } from "bun:test"

import {
  isDockerBackendConfigured,
  resolveDockerSandboxConfig,
} from "@/lib/sandbox-config"

describe("isDockerBackendConfigured", () => {
  test("true when DOCKER_HOST is set", () => {
    expect(
      isDockerBackendConfigured({ DOCKER_HOST: "tcp://proxy:80" })
    ).toBe(true)
  })

  test("falls back to the default socket check without env", () => {
    expect(typeof isDockerBackendConfigured({})).toBe("boolean")
  })

  test("docker config keeps the sandbox image and deny-all policy", () => {
    const config = resolveDockerSandboxConfig({
      SANDBOX_DOCKER_IMAGE: "miniscira:test",
    })
    expect(config.image).toBe("miniscira:test")
    expect(config.networkPolicy).toBe("deny-all")
  })
})
