import { describe, expect, test } from "bun:test"

import {
  DEFAULT_RUNTIME_PORT,
  resolveRuntimePort,
} from "@/lib/runtime-port"

describe("resolveRuntimePort", () => {
  test("returns 3000 when PORT is unset", () => {
    expect(resolveRuntimePort({})).toBe(3000)
    expect(resolveRuntimePort({})).toBe(DEFAULT_RUNTIME_PORT)
  })

  test("returns the injected PORT", () => {
    expect(resolveRuntimePort({ PORT: "8080" })).toBe(8080)
    expect(resolveRuntimePort({ PORT: " 3000 " })).toBe(3000)
  })

  test("rejects invalid PORT values", () => {
    for (const PORT of ["abc", "0", "-1", "65536", "3.5", "3000x"]) {
      expect(() => resolveRuntimePort({ PORT })).toThrow(/PORT/)
    }
  })
})
