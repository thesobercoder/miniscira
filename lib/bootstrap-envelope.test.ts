import { describe, expect, test } from "bun:test"

import {
  BOOTSTRAP_CHECKPOINT_FILENAME,
  stripSentBootstrapEnvelope,
  visibleBootstrapText,
  wrapBootstrapMessage,
} from "@/lib/bootstrap-envelope"
import type { ChatEvent } from "@/lib/chat-events"

const checkpoint = {
  checkpointId: "checkpoint-1",
  coveredMessageCount: 24,
  coveredMessageDigest: "digest-1",
  summary: "EARLY=violet-orbit\nMIDDLE=cedar-lantern",
}

describe("bootstrap checkpoint envelope", () => {
  test("sends readable checkpoint context beside unchanged user text", () => {
    const wrapped = wrapBootstrapMessage("What did I tell you?", checkpoint)
    expect(Array.isArray(wrapped)).toBe(true)
    if (!Array.isArray(wrapped)) throw new Error("expected content parts")

    expect(wrapped[0]).toMatchObject({
      type: "file",
      filename: BOOTSTRAP_CHECKPOINT_FILENAME,
      mediaType: "application/json",
    })
    expect(wrapped[1]).toMatchObject({ type: "text" })
    if (wrapped[1]?.type !== "text") throw new Error("expected checkpoint text")
    expect(wrapped[1].text).toContain("EARLY=violet-orbit")
    if (wrapped[0]?.type !== "file") throw new Error("expected checkpoint file")
    expect(decodeURIComponent(String(wrapped[0].data))).not.toContain(
      "EARLY=violet-orbit"
    )
    expect(wrapped[2]).toEqual({
      type: "text",
      text: "What did I tell you?",
    })
  })

  test("strips only the exact envelope generated for the sent message", () => {
    const wrapped = wrapBootstrapMessage("What did I tell you?", checkpoint)
    if (!Array.isArray(wrapped)) throw new Error("expected content parts")
    const received = {
      type: "message.received",
      data: {
        message: `${visibleBootstrapText(wrapped)}`,
        parts: wrapped,
      },
    } as unknown as ChatEvent
    const stripped = stripSentBootstrapEnvelope(received, wrapped) as unknown as {
      data: { message: string; parts: typeof wrapped }
    }
    expect(stripped.data.parts).toEqual([
      { type: "text", text: "What did I tell you?" },
    ])
    expect(stripped.data.message).toBe("What did I tell you?")
    expect(visibleBootstrapText(stripped.data.parts)).toBe(
      "What did I tell you?"
    )
  })

  test("does not hide a user-authored matching envelope without provenance", () => {
    const wrapped = wrapBootstrapMessage("Current question", checkpoint)
    if (!Array.isArray(wrapped)) throw new Error("expected content parts")
    const userParts = wrapped.map((part) => ({ ...part }))
    expect(visibleBootstrapText(userParts)).toContain("EARLY=violet-orbit")

    const received = {
      type: "message.received",
      data: { parts: userParts },
    } as unknown as ChatEvent
    const unrelatedSentMessage = "Current question"
    expect(stripSentBootstrapEnvelope(received, unrelatedSentMessage)).toBe(
      received
    )
  })

  test("prepends the checkpoint without changing existing parts", () => {
    const text = { type: "text" as const, text: "Inspect this." }
    const file = {
      type: "file" as const,
      mediaType: "image/png",
      data: "data:image/png;base64,AA==",
    }
    const wrapped = wrapBootstrapMessage([text, file], checkpoint)
    expect(Array.isArray(wrapped)).toBe(true)
    if (!Array.isArray(wrapped)) throw new Error("expected content parts")
    expect(wrapped.slice(2)).toEqual([text, file])
  })
})
