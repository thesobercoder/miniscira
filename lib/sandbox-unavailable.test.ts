import { describe, expect, test } from "bun:test"

import {
  isSandboxUnavailableError,
  SANDBOX_UNAVAILABLE_MESSAGE,
  sandboxUnavailableResult,
} from "@/lib/sandbox-unavailable"

describe("sandbox-unavailable contract", () => {
  test("result is a clear failure with empty outputs", () => {
    const result = sandboxUnavailableResult("demo", "print(1)")
    expect(result).toEqual({
      title: "demo",
      code: "print(1)",
      stdout: "",
      stderr: SANDBOX_UNAVAILABLE_MESSAGE,
      exitCode: 1,
      ok: false,
      images: [],
      files: [],
    })
    expect(result.stderr).toContain("no Docker sandbox")
  })

  test("classifies Docker/sandbox failures as unavailable", () => {
    expect(
      isSandboxUnavailableError(
        new Error("DOCKER_HOST is not set: no Docker sandbox available")
      )
    ).toBe(true)
    expect(
      isSandboxUnavailableError(
        new Error("dial unix /var/run/docker.sock: no such file")
      )
    ).toBe(true)
    expect(isSandboxUnavailableError(new Error("connection refused"))).toBe(
      true
    )
  })

  test("leaves unrelated failures alone", () => {
    expect(
      isSandboxUnavailableError(new Error("validation failed: empty code"))
    ).toBe(false)
  })
})
