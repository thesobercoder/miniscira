import { describe, expect, test } from "bun:test"
import {
  addChatListRow,
  CHAT_CREATED_EVENT,
  type ChatListRow,
  type ChatListState,
  chatCreatedEvent,
  titleChatListRow,
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

  test("keeps an optimistic branch separate from the stale server payload", () => {
    const serverRows: ChatListRow[] = []
    const initial: ChatListState = { source: serverRows, rows: serverRows }

    const optimistic = addChatListRow(initial, row)

    expect(optimistic.source).toBe(serverRows)
    expect(optimistic.rows).toEqual([row])
    expect(addChatListRow(optimistic, row)).toBe(optimistic)
  })

  test("updates the optimistic branch title without dropping the row", () => {
    const state: ChatListState = { source: [], rows: [row] }

    expect(
      titleChatListRow(state, { id: row.id, title: "Renamed branch" }).rows
    ).toEqual([{ ...row, title: "Renamed branch" }])
  })
})
