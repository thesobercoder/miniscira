import { describe, expect, test } from "bun:test"
import type { EveMessage, EveMessagePart } from "eve/client"

import {
  digestMessagePrefix,
  packCompactionUnits,
  selectCompatibleCheckpoint,
  serializeCompactionUnits,
  type StoredConversationCheckpoint,
} from "@/lib/conversation-checkpoint"

function message(id: string, role: "user" | "assistant", parts: EveMessagePart[]): EveMessage {
  return { id, role, parts }
}

const messages = [
  message("m1", "user", [{ type: "text", text: "EARLY=violet-orbit" }]),
  message("m2", "assistant", [{ type: "text", text: "MIDDLE=cedar-lantern" }]),
  message("m3", "user", [{ type: "text", text: "RECENT=glass-river" }]),
]

function checkpoint(
  coveredMessageCount: number,
  coveredMessageDigest: string,
  createdAt: Date
): StoredConversationCheckpoint {
  return {
    id: crypto.randomUUID(),
    chatId: crypto.randomUUID(),
    version: 1,
    coveredMessageCount,
    coveredMessageDigest,
    summary: `summary-${coveredMessageCount}`,
    createdAt,
  }
}

describe("conversation checkpoints", () => {
  test("binds a checkpoint to one exact ordered visible-message prefix", () => {
    const firstTwo = digestMessagePrefix(messages, 2)
    expect(firstTwo).toBe(digestMessagePrefix(messages.slice(0, 2)))
    expect(firstTwo).not.toBe(digestMessagePrefix([messages[1], messages[0]]))
    expect(firstTwo).not.toBe(
      digestMessagePrefix([
        messages[0],
        message("replacement", "assistant", [{ type: "text", text: "changed" }]),
      ])
    )
  })

  test("selects the newest compatible checkpoint and rejects a rewound prefix", () => {
    const old = checkpoint(1, digestMessagePrefix(messages, 1), new Date("2026-09-01T00:00:00Z"))
    const current = checkpoint(2, digestMessagePrefix(messages, 2), new Date("2026-09-01T01:00:00Z"))
    const discarded = checkpoint(3, digestMessagePrefix(messages, 3), new Date("2026-09-01T02:00:00Z"))

    expect(selectCompatibleCheckpoint(messages, [old, current])).toEqual(current)
    expect(selectCompatibleCheckpoint(messages.slice(0, 2), [discarded, old])).toEqual(old)
  })

  test("packs every serialized unit without sampling or over-cap chunks", () => {
    const units = ["a".repeat(17), "b".repeat(4), "c".repeat(23), "d"]
    const chunks = packCompactionUnits(units, 10)

    expect(chunks.every((chunk) => chunk.length <= 10)).toBe(true)
    expect(chunks.join("")).toBe(units.join(""))
  })

  test("serializes text, citations, attachments, and terminal tool results without credentials", () => {
    const source = [
      message("mixed", "assistant", [
        { type: "text", text: "Read [source](https://example.test/source)." },
        {
          type: "file",
          filename: "report.pdf",
          mediaType: "application/pdf",
          url: "https://private.test/report.pdf?token=do-not-copy",
        },
        {
          type: "dynamic-tool",
          toolCallId: "tool_1",
          toolName: "lookup",
          state: "output-available",
          input: { privateKey: "do-not-copy", query: "safe" },
          output: { authorization: "Bearer do-not-copy", result: "kept" },
        },
      ]),
    ]

    const serialized = serializeCompactionUnits(source).join("")
    expect(serialized).toContain("https://example.test/source")
    expect(serialized).toContain("report.pdf")
    expect(serialized).toContain("application/pdf")
    expect(serialized).toContain("lookup")
    expect(serialized).toContain("kept")
    expect(serialized).toContain("[REDACTED]")
    expect(serialized).not.toContain("do-not-copy")
    expect(serialized).not.toContain("https://private.test/report.pdf")
  })
})
