import { describe, expect, test } from "bun:test"
import { rewriteDockerArgs } from "./eve-docker-wrapper.mjs"

describe("rewriteDockerArgs", () => {
  test("routes Eve deny-all containers onto the internal egress network", () => {
    const args = [
      "run",
      "-d",
      "--label",
      "eve.sandbox=1",
      "--network",
      "none",
      "image:tag",
      "-c",
      "sleep 2147483647",
    ]
    expect(
      rewriteDockerArgs(args, {
        SANDBOX_DOCKER_NETWORK: "miniscira_sandbox-egress",
      })
    ).toEqual([
      "run",
      "-d",
      "--label",
      "eve.sandbox=1",
      "--network",
      "miniscira_sandbox-egress",
      "image:tag",
      "-c",
      "sleep 2147483647",
    ])
  })

  test("does not rewrite unrelated docker commands", () => {
    expect(rewriteDockerArgs(["version"], {})).toEqual(["version"])
  })

  test("rewrites Docker's equals-form network option", () => {
    expect(
      rewriteDockerArgs(
        ["run", "--label", "eve.sandbox=1", "--network=none", "image"],
        { SANDBOX_DOCKER_NETWORK: "miniscira_sandbox-egress" }
      )
    ).toEqual([
      "run",
      "--label",
      "eve.sandbox=1",
      "--network=miniscira_sandbox-egress",
      "image",
    ])
  })

  test("routes Eve template-build containers that request allow-all", () => {
    expect(
      rewriteDockerArgs(["run", "-d", "--label", "eve.sandbox=1", "image"], {
        SANDBOX_DOCKER_NETWORK: "miniscira_sandbox-egress",
      })
    ).toEqual([
      "run",
      "--network",
      "miniscira_sandbox-egress",
      "-d",
      "--label",
      "eve.sandbox=1",
      "image",
    ])
  })

  test("fails closed when the allowlist network is not configured", () => {
    expect(() =>
      rewriteDockerArgs(
        ["run", "--label", "eve.sandbox=1", "--network", "none", "image"],
        {}
      )
    ).toThrow("SANDBOX_DOCKER_NETWORK")
  })
})
