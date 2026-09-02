import { describe, expect, test } from "bun:test"
import type { EveMessage, EveMessagePart } from "eve/client"

import {
  BOOTSTRAP_CHECKPOINT_FILENAME,
  stripSentBootstrapEnvelope,
  visibleBootstrapText,
  wrapBootstrapMessage,
} from "@/lib/bootstrap-envelope"
import type { ChatEvent } from "@/lib/chat-events"
import {
  packCompactionUnits,
  retainedMessagePrefix,
  serializeCompactionUnits,
} from "@/lib/conversation-checkpoint"
import {
  CHECKPOINT_REQUEST_CHUNK_CHARS,
  foldCompactionChunks,
} from "@/lib/conversation-compaction"

const markers = [
  "EARLY_07=violet-orbit",
  "MIDDLE_07=cedar-lantern",
  "RECENT_07=glass-river",
  "https://example.invalid/source-0",
  "retained-note.txt",
] as const

function message(
  id: string,
  role: "user" | "assistant",
  text: string,
  extraParts: EveMessagePart[] = []
): EveMessage {
  return {
    id,
    role,
    parts: [{ type: "text", text }, ...extraParts],
  }
}

function longTranscript(): EveMessage[] {
  return Array.from({ length: 18 }, (_, index) => {
    const role = index % 2 === 0 ? "user" : "assistant"
    const facts = [
      index === 0 ? markers[0] : "",
      index === 8 ? markers[1] : "",
      index === 16 ? markers[2] : "",
      index === 2 ? markers[3] : "",
    ]
      .filter(Boolean)
      .join(" ")
    const attachments: EveMessagePart[] =
      index === 10
        ? [
            {
              type: "file",
              filename: markers[4],
              mediaType: "text/plain",
              url: "data:text/plain;base64,c2lsdmVyLWZlcm4=",
            },
          ]
        : []
    return message(
      `message-${index}`,
      role,
      `${facts}\n${`lossless-unit-${index} `.repeat(700)}`,
      attachments
    )
  })
}

describe("long-conversation checkpoint proof", () => {
  test("retains every source unit across multiple request batches", async () => {
    const messages = longTranscript()
    const units = serializeCompactionUnits(messages)
    const chunks = packCompactionUnits(units, CHECKPOINT_REQUEST_CHUNK_CHARS)

    expect(units.join("").length).toBeGreaterThan(200_000)
    expect(chunks.length).toBeGreaterThan(3)
    expect(chunks.every((chunk) => chunk.length <= CHECKPOINT_REQUEST_CHUNK_CHARS)).toBe(
      true
    )
    expect(chunks.join("")).toBe(units.join(""))

    const seen: string[] = []
    const summary = await foldCompactionChunks({
      chunks,
      summarize: async ({ transcriptChunk }) => {
        seen.push(transcriptChunk)
        const retained = markers.filter((marker) => transcriptChunk.includes(marker))
        return retained.join("\n") || "no markers in this batch"
      },
    })

    expect(seen).toEqual([...chunks])
    for (const marker of markers) expect(summary).toContain(marker)
  })

  test("puts readable durable context in Eve while hiding only that context in the UI", () => {
    const summary = markers.join("\n")
    const currentMessage = "What were the retained facts?"
    const wrapped = wrapBootstrapMessage(currentMessage, {
      checkpointId: "checkpoint-live-proof",
      coveredMessageCount: 18,
      coveredMessageDigest: "digest-live-proof",
      summary,
    })

    expect(Array.isArray(wrapped)).toBe(true)
    if (!Array.isArray(wrapped)) throw new Error("expected structured user content")

    expect(wrapped[0]).toMatchObject({
      type: "file",
      filename: BOOTSTRAP_CHECKPOINT_FILENAME,
    })
    expect(wrapped[1]).toMatchObject({ type: "text" })
    if (wrapped[1]?.type !== "text") throw new Error("expected readable context")
    for (const marker of markers) expect(wrapped[1].text).toContain(marker)
    expect(wrapped[2]).toEqual({ type: "text", text: currentMessage })
    const received = {
      type: "message.received",
      data: { parts: wrapped },
    } as unknown as ChatEvent
    const stripped = stripSentBootstrapEnvelope(received, wrapped) as unknown as {
      data: { parts: EveMessagePart[] }
    }
    expect(visibleBootstrapText(stripped.data.parts)).toBe(currentMessage)
  })

  test("rejects a reordered or partial rewind boundary", () => {
    const messages = longTranscript()
    const exactPrefix = messages.slice(0, 8).map((item) => item.id)

    expect(retainedMessagePrefix(messages, exactPrefix)).toEqual(messages.slice(0, 8))
    expect(() =>
      retainedMessagePrefix(messages, [messages[0].id, messages[2].id])
    ).toThrow("Retained messages must be an exact visible transcript prefix")
  })
})
