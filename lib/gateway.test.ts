import { describe, expect, test } from "bun:test"
import { APICallError } from "@ai-sdk/provider"

import { summarizeLanguageModelRequest, withOneRetry } from "@/lib/gateway"

function apiError(isRetryable: boolean) {
  return new APICallError({
    message: "provider failed with secret details",
    url: "https://gateway.example/v1/chat",
    requestBodyValues: { secret: "do-not-log" },
    responseBody: "private response body",
    responseHeaders: { authorization: "Bearer secret" },
    isRetryable,
  })
}

describe("withOneRetry", () => {
  test("retries an API call error once", async () => {
    let calls = 0
    const model = withOneRetry({
      modelId: "test-model",
      async doStream() {
        calls += 1
        if (calls === 1) throw apiError(true)
        return "ok"
      },
    })

    expect(await model.doStream()).toBe("ok")
    expect(calls).toBe(2)
  })

  test("marks the exhausted retry as permanent for outer AI SDK callers", async () => {
    let calls = 0
    const model = withOneRetry({
      modelId: "test-model",
      async doStream() {
        calls += 1
        throw apiError(true)
      },
    })

    try {
      await model.doStream()
      throw new Error("expected the model call to fail")
    } catch (error) {
      expect(APICallError.isInstance(error)).toBe(true)
      if (!APICallError.isInstance(error)) return
      expect(error.isRetryable).toBe(false)
      expect(error.message).toBe("Model request failed after retry.")
      expect(error.url).toBe("https://gateway.example/v1/chat")
      expect(error.cause).toBeInstanceOf(APICallError)
    }
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

  test("does not retry a permanent API call error", async () => {
    let calls = 0
    const error = apiError(false)
    const model = withOneRetry({
      modelId: "test-model",
      async doStream() {
        calls += 1
        throw error
      },
    })

    expect(model.doStream()).rejects.toBe(error)
    expect(calls).toBe(1)
  })
})

describe("wire request metadata", () => {
  const prompt = [
    { role: "system", content: "private system prompt" },
    {
      role: "user",
      content: [
        { type: "text", text: "private user prompt" },
        {
          type: "file",
          filename: "secret-photo.jpg",
          mediaType: "image/jpeg",
          data: { type: "data", data: new Uint8Array([1, 2, 3, 4]) },
        },
        {
          type: "file",
          filename: "secret-scan.png",
          mediaType: "image/png",
          data: { type: "data", data: "AQIDBAU=" },
        },
        {
          type: "file",
          filename: "secret-audio.wav",
          mediaType: "audio/wav",
          data: {
            type: "url",
            url: new URL("data:audio/wav;base64,AQIDBAUG"),
          },
        },
        {
          type: "file",
          filename: "remote.pdf",
          mediaType: "application/pdf",
          data: { type: "url", url: new URL("https://private.example/a") },
        },
      ],
    },
    {
      role: "assistant",
      content: [
        { type: "reasoning", text: "private reasoning" },
        { type: "tool-call", toolCallId: "call-1", toolName: "private" },
      ],
    },
    {
      role: "tool",
      content: [{ type: "tool-result", toolCallId: "call-1" }],
    },
  ]

  test("summarizes roles, parts, media types, and derivable byte sizes", () => {
    expect(summarizeLanguageModelRequest({ prompt })).toEqual({
      roleCounts: { assistant: 1, system: 1, tool: 1, user: 1 },
      partTypeCounts: {
        file: 4,
        reasoning: 1,
        text: 2,
        "tool-call": 1,
        "tool-result": 1,
      },
      files: [
        { mediaType: "image/jpeg", byteSize: 4 },
        { mediaType: "image/png", byteSize: 5 },
        { mediaType: "audio/wav", byteSize: 6 },
        { mediaType: "application/pdf" },
      ],
    })
  })

  test("logs one redacted request shape before every attempt", async () => {
    const previousWireLog = process.env.MINISCIRA_WIRE_LOG
    const debugEntries: string[] = []
    const previousDebug = console.debug
    process.env.MINISCIRA_WIRE_LOG = "1"
    console.debug = (entry) => debugEntries.push(String(entry))

    try {
      let calls = 0
      const model = withOneRetry({
        modelId: "test-model",
        async doStream(_options: unknown) {
          calls += 1
          if (calls === 1) throw apiError(true)
          return "ok"
        },
      })

      expect(await model.doStream({ prompt })).toBe("ok")
      expect(debugEntries).toHaveLength(2)
      const firstEntry = JSON.parse(debugEntries[0] ?? "")
      const secondEntry = JSON.parse(debugEntries[1] ?? "")
      expect(firstEntry).toEqual({
        requestId: expect.any(String),
        attempt: 1,
        modelId: "test-model",
        ...summarizeLanguageModelRequest({ prompt }),
      })
      expect(secondEntry).toEqual({
        requestId: firstEntry.requestId,
        attempt: 2,
        modelId: "test-model",
        ...summarizeLanguageModelRequest({ prompt }),
      })

      const combinedLogs = debugEntries.join("\n")
      for (const privateValue of [
        "private",
        "secret",
        "prompt",
        "filename",
        "authorization",
        "response",
        "AQID",
        "https://",
        "data:",
      ]) {
        expect(combinedLogs).not.toContain(privateValue)
      }
    } finally {
      console.debug = previousDebug
      if (previousWireLog === undefined) delete process.env.MINISCIRA_WIRE_LOG
      else process.env.MINISCIRA_WIRE_LOG = previousWireLog
    }
  })
})
