import { describe, expect, test } from "bun:test"
import type { EveMessage, EveMessagePart } from "eve/client"

import {
  BOOTSTRAP_CHECKPOINT_FILENAME,
  wrapBootstrapMessage,
} from "@/lib/bootstrap-envelope"
import {
  digestMessagePrefix,
  InvalidRetainedPrefixError,
  packCompactionUnits,
  retainedMessagePrefix,
  selectCompatibleCheckpoint,
  serializeCompactionUnits,
  type StoredConversationCheckpoint,
} from "@/lib/conversation-checkpoint"
import {
  longConversationFixture,
  RETENTION_FACTS,
} from "@/lib/long-conversation-fixture"

function message(
  id: string,
  role: "user" | "assistant",
  parts: EveMessagePart[]
): EveMessage {
  return { id, role, parts }
}

const messages = [
  message("m1", "user", [{ type: "text", text: "EARLY=violet-orbit" }]),
  message("m2", "assistant", [
    { type: "text", text: "MIDDLE=cedar-lantern" },
  ]),
  message("m3", "user", [{ type: "text", text: "RECENT=glass-river" }]),
]

function checkpoint(count: number): StoredConversationCheckpoint {
  return {
    id: `checkpoint-${count}`,
    chatId: "chat-1",
    version: 1,
    coveredMessageCount: count,
    coveredMessageDigest: digestMessagePrefix(messages, count),
    summary: `summary-${count}`,
    createdAt: new Date(count * 1_000),
  }
}

describe("conversation checkpoints", () => {
  test("retains facts from the early, middle, and recent thirds", () => {
    const transcript = serializeCompactionUnits(longConversationFixture()).join("")
    expect(transcript).toContain(RETENTION_FACTS.early)
    expect(transcript).toContain(RETENTION_FACTS.middle)
    expect(transcript).toContain(RETENTION_FACTS.recent)
  })

  test("binds compatibility to one exact ordered visible prefix", () => {
    expect(digestMessagePrefix(messages, 2)).toBe(
      digestMessagePrefix(messages.slice(0, 2))
    )
    expect(digestMessagePrefix(messages, 2)).not.toBe(
      digestMessagePrefix([messages[1], messages[0]])
    )
    expect(selectCompatibleCheckpoint(messages, [checkpoint(1), checkpoint(2)])).toEqual(
      checkpoint(2)
    )
    const edited = [
      message("m1", "user", [{ type: "text", text: "EARLY=changed" }]),
      ...messages.slice(1),
    ]
    expect(digestMessagePrefix(edited, 2)).not.toBe(
      digestMessagePrefix(messages, 2)
    )
  })

  test("accepts only an exact retained prefix", () => {
    expect(retainedMessagePrefix(messages, ["m1", "m2"])).toEqual(
      messages.slice(0, 2)
    )
    expect(() => retainedMessagePrefix(messages, ["m1", "m3"])).toThrow(
      InvalidRetainedPrefixError
    )
  })

  test("packs every unit without sampling across request-sized chunks", () => {
    const units = ["a".repeat(17), "b".repeat(4), "c".repeat(23), "d"]
    const chunks = packCompactionUnits(units, 10)
    expect(chunks.every((chunk) => chunk.length <= 10)).toBe(true)
    expect(chunks.join("")).toBe(units.join(""))
  })

  test("keeps sanitized tool results, citations, attachments, and ordinary reserved-name files", () => {
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
          type: "file",
          filename: BOOTSTRAP_CHECKPOINT_FILENAME,
          mediaType: "application/json",
          url: "data:application/json,secret-checkpoint",
        },
        {
          type: "dynamic-tool",
          toolCallId: "tool-1",
          toolName: "lookup",
          state: "output-available",
          input: { "X-Auth": "do-not-copy" },
          output: {
            result: "private-result",
            AWS_SECRET_ACCESS_KEY: "tool-secret",
          },
        },
      ]),
    ]

    const serialized = serializeCompactionUnits(source).join("")
    expect(serialized).toContain("https://example.test/source")
    expect(serialized).toContain("report.pdf")
    expect(serialized).toContain("lookup")
    expect(serialized).not.toContain("do-not-copy")
    expect(serialized).not.toContain("tool-secret")
    expect(serialized).toContain("private-result")
    expect(serialized).toContain(BOOTSTRAP_CHECKPOINT_FILENAME)
  })

  test("does not infer machine ownership from persisted user parts", () => {
    const wrapped = wrapBootstrapMessage(
      [{ type: "text", text: "unchanged user text" }],
      {
        checkpointId: "checkpoint-id",
        coveredMessageCount: 2,
        coveredMessageDigest: "digest",
        summary: "USER_AUTHORED_SUMMARY",
      }
    ) as EveMessagePart[]
    const serialized = serializeCompactionUnits([
      message("bootstrap", "user", wrapped),
    ]).join("")
    expect(serialized).toContain("unchanged user text")
    expect(serialized).toContain("USER_AUTHORED_SUMMARY")
    expect(serialized).toContain(BOOTSTRAP_CHECKPOINT_FILENAME)
  })

  test("redacts common standalone credential formats", () => {
    const secrets = [
      `ghp_${"a".repeat(36)}`,
      `xoxb-${"b".repeat(30)}`,
      `AKIA${"C".repeat(16)}`,
      `client_secret=${"d".repeat(24)}`,
    ]
    const serialized = serializeCompactionUnits([
      message("secrets", "user", [
        { type: "text", text: secrets.join(" ") } as EveMessagePart,
      ]),
    ]).join("")
    for (const secret of secrets) expect(serialized).not.toContain(secret)
    expect(serialized.match(/\[REDACTED\]/g)?.length).toBe(4)
  })

  test("prefers semantic chunk boundaries without dropping input", () => {
    const identifier = "SOURCE_URL=https://example.invalid/a/semantic/value"
    const input = `prefix words ${identifier} suffix words`
    const chunks = packCompactionUnits([input], 58)
    expect(chunks.join("")).toBe(input)
    expect(chunks.some((chunk) => chunk.includes(identifier))).toBe(true)
  })
})
