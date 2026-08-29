import { describe, expect, test } from "bun:test"
import type { MessageStreamEvent } from "eve/client"

import { extractAnswerText } from "./lookout-runner"

function event(value: unknown): MessageStreamEvent {
  return value as MessageStreamEvent
}

describe("extractAnswerText", () => {
  test("returns only the final stopped message", () => {
    expect(
      extractAnswerText([
        event({
          type: "message.completed",
          data: {
            finishReason: "tool-calls",
            message: "I found the release. Let me check X.",
          },
        }),
        event({
          type: "message.completed",
          data: {
            finishReason: "tool-calls",
            message: "X is unavailable. Let me finalize.",
          },
        }),
        event({
          type: "message.completed",
          data: {
            finishReason: "stop",
            message: "# Final report\n\nThe current release is 1.7.4.",
          },
        }),
      ])
    ).toBe("# Final report\n\nThe current release is 1.7.4.")
  })

  test("uses the latest stopped message", () => {
    expect(
      extractAnswerText([
        event({
          type: "message.completed",
          data: { finishReason: "stop", message: "old" },
        }),
        event({
          type: "message.completed",
          data: { finishReason: "stop", message: "new" },
        }),
      ])
    ).toBe("new")
  })
})
