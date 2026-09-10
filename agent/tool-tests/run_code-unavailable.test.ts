import { describe, expect, test } from "bun:test"

import { SANDBOX_UNAVAILABLE_MESSAGE } from "@/lib/sandbox-unavailable"

import runCodeTool from "../tools/run_code"

const tool = runCodeTool as unknown as {
  execute: (
    input: { code: string; title?: string },
    ctx: unknown
  ) => Promise<Record<string, unknown>>
}

function noDockerCtx() {
  return {
    session: { auth: { current: null } },
    getSandbox: async (): Promise<never> => {
      throw new Error("DOCKER_HOST is not set: no Docker sandbox available")
    },
  }
}

describe("run_code Railway no-Docker path", () => {
  test("returns a clear unavailable result instead of hanging or throwing", async () => {
    const result = await tool.execute(
      { code: "print('hi')", title: "demo" },
      noDockerCtx()
    )
    expect(result.ok).toBe(false)
    expect(result.exitCode).toBe(1)
    expect(result.stdout).toBe("")
    expect(result.stderr).toBe(SANDBOX_UNAVAILABLE_MESSAGE)
    expect(result.images).toEqual([])
    expect(result.files).toEqual([])
  })

  test("mid-run sandbox loss also returns the unavailable result", async () => {
    const dockerGone = () =>
      Promise.reject(
        new Error("dial unix /var/run/docker.sock: no such file")
      )
    const ctx = {
      session: { auth: { current: null } },
      getSandbox: async () => ({
        run: dockerGone,
        writeTextFile: async () => undefined,
        writeBinaryFile: async () => undefined,
        readBinaryFile: async () => null,
      }),
    }
    const result = await tool.execute({ code: "print('hi')" }, ctx)
    expect(result.ok).toBe(false)
    expect(result.stderr).toBe(SANDBOX_UNAVAILABLE_MESSAGE)
  })
})
