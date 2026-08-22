import { describe, expect, test } from "bun:test"
import type { EveMessage } from "eve/client"
import {
  messagesBeforeReplacement,
  nextReplacementTurnIndex,
  replacementMessageIds,
} from "@/lib/replace-turn"

const message = (id: string, role: "user" | "assistant"): EveMessage =>
  ({ id, role, parts: [] }) as EveMessage

const messages = [
  message("u1", "user"),
  message("a1", "assistant"),
  message("u2", "user"),
  message("a2", "assistant"),
  message("u3", "user"),
  message("a3", "assistant"),
]

describe("replace turn planning", () => {
  test("rewinds to an earlier user message and discards every later message", () => {
    expect(replacementMessageIds(messages, 2, new Set())).toEqual([
      "u2",
      "a2",
      "u3",
      "a3",
    ])
    expect(
      messagesBeforeReplacement(messages, 2, new Set()).map((m) => m.id)
    ).toEqual(["u1", "a1"])
  })

  test("ignores messages an older replacement already hid", () => {
    const hidden = new Set(["u2", "a2"])
    expect(replacementMessageIds(messages, 4, hidden)).toEqual(["u3", "a3"])
    expect(
      messagesBeforeReplacement(messages, 4, hidden).map((m) => m.id)
    ).toEqual(["u1", "a1"])
  })

  test("allocates a new attachment turn instead of overwriting history", () => {
    expect(nextReplacementTurnIndex(messages, [0, -1, 1, -1, 2, -1])).toBe(3)
  })
})
