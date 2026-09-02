import { describe, expect, test } from "bun:test"

import { BOOTSTRAP_CHECKPOINT_FILENAME } from "@/lib/bootstrap-envelope"
import { checkpointedMessage } from "@/lib/conversation-checkpoint-client"

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  })
}

describe("checkpointedMessage", () => {
  test("sends the exact retained prefix and returns checkpoint plus unchanged user text", async () => {
    let requestBody: unknown
    const message = await checkpointedMessage({
      chatId: "chat-1",
      model: "gpt-5.6-sol",
      message: "retry this",
      retainedMessageIds: ["m1", "m2"],
      fetcher: async (_input, init) => {
        requestBody = JSON.parse(String(init?.body))
        return response({
          checkpoint: {
            checkpointId: "checkpoint-1",
            coveredMessageCount: 2,
            coveredMessageDigest: "digest",
            summary: "EARLY=violet-orbit",
          },
        })
      },
    })

    expect(requestBody).toEqual({
      model: "gpt-5.6-sol",
      retainedMessageIds: ["m1", "m2"],
    })
    expect(Array.isArray(message)).toBe(true)
    if (!Array.isArray(message)) throw new Error("expected content parts")
    expect(message[0]).toMatchObject({
      type: "file",
      filename: BOOTSTRAP_CHECKPOINT_FILENAME,
    })
    expect(message[1]).toMatchObject({ type: "text" })
    expect(message[2]).toEqual({ type: "text", text: "retry this" })
  })

  test("leaves the first message unchanged without prior history", async () => {
    expect(
      await checkpointedMessage({
        chatId: "chat-1",
        model: "gpt-5.6-sol",
        message: "first turn",
        fetcher: async () => response({ checkpoint: null }),
      })
    ).toBe("first turn")
  })
})
