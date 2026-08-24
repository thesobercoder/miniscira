import { describe, expect, test } from "bun:test"
import {
  CHAT_CREATED_EVENT,
  type ChatListPagePayload,
  type ChatListRow,
  chatCreatedEvent,
  createHistoryWindow,
  HISTORY_MAX_RENDERED_ROWS,
  historyRows,
  historyWindowReducer,
  nextHistoryIntent,
  reloadHistoryIntent,
  renderedHistorySlots,
  scrollAnchorDelta,
} from "@/lib/chat-list-events"

const row = (id: string, title = `Chat ${id}`): ChatListRow => ({
  id,
  title,
  updatedAt: "2026-08-22T09:00:00.000Z",
})

const page = (
  chats: ChatListRow[],
  nextCursor: string | null = null
): ChatListPagePayload => ({ chats, nextCursor })

describe("chat list events", () => {
  test("creates the event consumed by the sidebar for branched chats", () => {
    const event = chatCreatedEvent(row("branch-1"))
    expect(event.type).toBe(CHAT_CREATED_EVENT)
    expect(event.detail).toEqual(row("branch-1"))
  })

  test("loads ordered slots and reconciles duplicate server rows", () => {
    const initial = createHistoryWindow({
      generation: "one",
      page: page([row("a"), row("b")], "next"),
    })
    const requested = historyWindowReducer(initial, {
      type: "pageRequested",
      slot: 1,
      cursor: "next",
    })
    const loaded = historyWindowReducer(requested, {
      type: "pageLoaded",
      slot: 1,
      cursor: "next",
      page: page([row("b", "Server title"), row("c")]),
    })

    expect(historyRows(loaded)).toEqual([row("a"), row("b"), row("c")])
    expect(nextHistoryIntent(loaded)).toBeNull()
  })

  test("preserves optimistic create, title, and delete state without duplicates", () => {
    const initial = createHistoryWindow({
      generation: "one",
      page: page([row("a")], "next"),
    })
    const created = historyWindowReducer(initial, {
      type: "chatCreated",
      row: row("b", "Draft"),
    })
    const duplicate = historyWindowReducer(created, {
      type: "chatCreated",
      row: row("b", "Draft"),
    })
    const titled = historyWindowReducer(duplicate, {
      type: "chatTitled",
      id: "b",
      title: "Final title",
    })
    const deleted = historyWindowReducer(titled, {
      type: "chatDeleted",
      id: "a",
    })

    expect(historyRows(deleted)).toEqual([row("b", "Final title")])
  })

  test("does not drop the last server row when a full first page gets a new chat", () => {
    const serverRows = Array.from({ length: 30 }, (_, index) =>
      row(`server-${index}`)
    )
    const initial = createHistoryWindow({
      generation: "one",
      page: page(serverRows, "after-server-29"),
    })
    const created = historyWindowReducer(initial, {
      type: "chatCreated",
      row: row("new", "New research"),
    })

    expect(historyRows(created)).toHaveLength(31)
    expect(historyRows(created).at(-1)).toEqual(row("server-29"))
    expect(nextHistoryIntent(created)).toEqual({
      slot: 1,
      cursor: "after-server-29",
    })
  })

  test("keeps an unloaded current chat until a page contains it", () => {
    const initial = createHistoryWindow({
      generation: "one",
      page: page([row("a")], "next"),
    })
    const withCurrent = historyWindowReducer(initial, {
      type: "currentChatLoaded",
      row: row("old"),
    })
    const requested = historyWindowReducer(withCurrent, {
      type: "pageRequested",
      slot: 1,
      cursor: "next",
    })
    const reconciled = historyWindowReducer(requested, {
      type: "pageLoaded",
      slot: 1,
      cursor: "next",
      page: page([row("old")]),
    })

    expect(withCurrent.currentChat).toEqual(row("old"))
    expect(reconciled.currentChat).toBeNull()
    expect(historyRows(reconciled)).toEqual([row("a"), row("old")])
  })

  test("preserves slots on failure and permits retry", () => {
    const initial = createHistoryWindow({
      generation: "one",
      page: page([row("a")], "next"),
    })
    const loading = historyWindowReducer(initial, {
      type: "pageRequested",
      slot: 1,
      cursor: "next",
    })
    const failed = historyWindowReducer(loading, {
      type: "pageFailed",
      slot: 1,
      cursor: "next",
      message: "Couldn't load more chats",
    })
    const retrying = historyWindowReducer(failed, {
      type: "pageRequested",
      slot: 1,
      cursor: "next",
    })

    expect(historyRows(failed)).toEqual([row("a")])
    expect(failed.load.kind).toBe("error")
    expect(retrying.load.kind).toBe("loading")
  })

  test("reloads evicted slots and caps loaded rows rendered around visibility", () => {
    let history = createHistoryWindow({
      generation: "one",
      page: page(
        Array.from({ length: 30 }, (_, index) => row(`0-${index}`)),
        "1"
      ),
    })
    for (let slot = 1; slot <= 10; slot += 1) {
      const cursor = String(slot)
      history = historyWindowReducer(history, {
        type: "pageRequested",
        slot,
        cursor,
      })
      history = historyWindowReducer(history, {
        type: "pageLoaded",
        slot,
        cursor,
        page: page(
          Array.from({ length: 30 }, (_, index) => row(`${slot}-${index}`)),
          slot === 10 ? null : String(slot + 1)
        ),
      })
    }

    const evicted = history.slots.findIndex((slot) => slot.kind === "evicted")
    expect(evicted).toBeGreaterThan(0)
    expect(history.slots[0].kind).toBe("loaded")
    expect(reloadHistoryIntent(history, evicted)).toEqual({
      slot: evicted,
      cursor: history.slots[evicted].inputCursor,
    })
    const renderedRows = renderedHistorySlots(history).reduce(
      (count, item) =>
        count + (item.slot.kind === "loaded" ? item.slot.rows.length : 0),
      0
    )
    expect(renderedRows).toBeLessThanOrEqual(HISTORY_MAX_RENDERED_ROWS)
  })

  test("ignores page requests after the cursor is exhausted", () => {
    const initial = createHistoryWindow({
      generation: "one",
      page: page([row("a")]),
    })
    expect(
      historyWindowReducer(initial, {
        type: "pageRequested",
        slot: 1,
        cursor: "stale",
      })
    ).toBe(initial)
  })

  test("computes scroll correction after an evicted slot reload", () => {
    expect(scrollAnchorDelta(120, 168)).toBe(48)
    expect(scrollAnchorDelta(168, 120)).toBe(-48)
  })
})
