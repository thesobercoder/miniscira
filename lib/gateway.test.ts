import { describe, expect, test } from "bun:test"

import { withOneRetry } from "@/lib/gateway"

function apiError() {
  const error = new Error("provider failed")
  error.name = "AI_APICallError"
  return error
}

describe("withOneRetry", () => {
  test("retries an API call error once", async () => {
    let calls = 0
    const model = withOneRetry({
      modelId: "test-model",
      async doStream() {
        calls += 1
        if (calls === 1) throw apiError()
        return "ok"
      },
    })

    expect(await model.doStream()).toBe("ok")
    expect(calls).toBe(2)
  })

  test("does not retry other errors", async () => {
    let calls = 0
    const model = withOneRetry({
      modelId: "test-model",
      async doGenerate() {
        calls += 1
        throw new TypeError("invalid input")
      },
    })

    expect(model.doGenerate()).rejects.toBeInstanceOf(TypeError)
    expect(calls).toBe(1)
  })
})
