import { describe, expect, test } from "bun:test"
import {
  CHAT_CREATED_EVENT,
  type ChatListRow,
  chatCreatedEvent,
} from "@/lib/chat-list-events"

const row: ChatListRow = {
  id: "branch-1",
  title: "Original chat (branch)",
  updatedAt: "2026-08-22T09:00:00.000Z",
}

describe("chat list events", () => {
  test("creates the event consumed by the sidebar for branched chats", () => {
    const event = chatCreatedEvent(row)

    expect(event.type).toBe(CHAT_CREATED_EVENT)
    expect(event.detail).toEqual(row)
  })
})
