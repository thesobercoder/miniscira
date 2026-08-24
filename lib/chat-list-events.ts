export type ChatListRow = {
  id: string
  title: string
  updatedAt: string
}

export type ChatListPagePayload = {
  chats: ChatListRow[]
  nextCursor: string | null
}

type LoadedHistorySlot = {
  kind: "loaded"
  key: string
  inputCursor: string | null
  nextCursor: string | null
  estimatedHeight: number
  rows: ChatListRow[]
}

type EvictedHistorySlot = {
  kind: "evicted"
  key: string
  inputCursor: string | null
  nextCursor: string | null
  estimatedHeight: number
  rowCount: number
}

export type HistorySlot = LoadedHistorySlot | EvictedHistorySlot

export type HistoryLoad =
  | { kind: "idle" }
  | { kind: "loading"; slot: number; cursor: string | null }
  | {
      kind: "error"
      slot: number
      cursor: string | null
      message: string
    }

export type HistoryWindow = {
  generation: string
  slots: HistorySlot[]
  currentChat: ChatListRow | null
  load: HistoryLoad
  visibleSlot: number
}

export type HistoryWindowAction =
  | { type: "sourceChanged"; generation: string; page: ChatListPagePayload }
  | { type: "pageRequested"; slot: number; cursor: string | null }
  | {
      type: "pageLoaded"
      slot: number
      cursor: string | null
      page: ChatListPagePayload
    }
  | { type: "pageFailed"; slot: number; cursor: string | null; message: string }
  | { type: "slotMeasured"; slot: number; height: number }
  | { type: "visibleSlotChanged"; slot: number }
  | { type: "chatCreated"; row: ChatListRow }
  | { type: "chatTitled"; id: string; title: string }
  | { type: "chatDeleted"; id: string }
  | { type: "currentChatLoaded"; row: ChatListRow | null }

export const CHAT_CREATED_EVENT = "miniscira:chat-created"
export const CHAT_TITLED_EVENT = "miniscira:chat-titled"
export const HISTORY_MAX_PAGES = 10
export const HISTORY_MAX_ROWS = 300
export const HISTORY_MAX_RENDERED_ROWS = 120
export const HISTORY_PAGE_ESTIMATED_HEIGHT = 960

export function chatCreatedEvent(row: ChatListRow) {
  return new CustomEvent<ChatListRow>(CHAT_CREATED_EVENT, { detail: row })
}

export function chatTitledEvent(id: string, title: string) {
  return new CustomEvent<{ id: string; title: string }>(CHAT_TITLED_EVENT, {
    detail: { id, title },
  })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function parseRow(value: unknown): ChatListRow | null {
  if (!isRecord(value)) return null
  if (
    typeof value.id !== "string" ||
    typeof value.title !== "string" ||
    typeof value.updatedAt !== "string" ||
    Number.isNaN(Date.parse(value.updatedAt))
  )
    return null
  return { id: value.id, title: value.title, updatedAt: value.updatedAt }
}

export function parseChatListPage(value: unknown): ChatListPagePayload | null {
  if (!isRecord(value) || !Array.isArray(value.chats)) return null
  if (value.nextCursor !== null && typeof value.nextCursor !== "string")
    return null
  const chats: ChatListRow[] = []
  for (const item of value.chats) {
    const row = parseRow(item)
    if (!row) return null
    chats.push(row)
  }
  return { chats, nextCursor: value.nextCursor }
}

export function parseCurrentChat(value: unknown): ChatListRow | null {
  if (!isRecord(value)) return null
  if (!isRecord(value.chat) || value.chat.activeOrdinary !== true) return null
  return parseRow(value.chat)
}

function slotKey(cursor: string | null) {
  return cursor ?? "first"
}

function loadedSlot(
  inputCursor: string | null,
  page: ChatListPagePayload,
  estimatedHeight = HISTORY_PAGE_ESTIMATED_HEIGHT
): LoadedHistorySlot {
  return {
    kind: "loaded",
    key: slotKey(inputCursor),
    inputCursor,
    nextCursor: page.nextCursor,
    estimatedHeight,
    rows: page.chats,
  }
}

function containsRow(slots: HistorySlot[], id: string) {
  return slots.some(
    (slot) => slot.kind === "loaded" && slot.rows.some((row) => row.id === id)
  )
}

function reconcileCurrent(current: ChatListRow | null, slots: HistorySlot[]) {
  return current && !containsRow(slots, current.id) ? current : null
}

function loadedRowCount(slots: HistorySlot[]) {
  return slots.reduce(
    (count, slot) => count + (slot.kind === "loaded" ? slot.rows.length : 0),
    0
  )
}

function capPayloads(slots: HistorySlot[], visibleSlot: number) {
  const next = [...slots]
  while (
    next.filter((slot) => slot.kind === "loaded").length > HISTORY_MAX_PAGES ||
    loadedRowCount(next) > HISTORY_MAX_ROWS
  ) {
    let candidate = -1
    let distance = -1
    for (let index = 0; index < next.length; index += 1) {
      const slot = next[index]
      if (slot.kind !== "loaded" || index === 0 || index === visibleSlot)
        continue
      const currentDistance = Math.abs(index - visibleSlot)
      if (currentDistance > distance) {
        candidate = index
        distance = currentDistance
      }
    }
    if (candidate < 0) break
    const slot = next[candidate]
    if (slot.kind !== "loaded") break
    next[candidate] = {
      kind: "evicted",
      key: slot.key,
      inputCursor: slot.inputCursor,
      nextCursor: slot.nextCursor,
      estimatedHeight: slot.estimatedHeight,
      rowCount: slot.rows.length,
    }
  }
  return next
}

function dedupeSlots(slots: HistorySlot[]) {
  const seen = new Set<string>()
  return slots.map((slot) => {
    if (slot.kind === "evicted") return slot
    return {
      ...slot,
      rows: slot.rows.filter((row) => {
        if (seen.has(row.id)) return false
        seen.add(row.id)
        return true
      }),
    }
  })
}

export function createHistoryWindow(input: {
  generation: string
  page: ChatListPagePayload
}): HistoryWindow {
  return {
    generation: input.generation,
    slots: [loadedSlot(null, input.page)],
    currentChat: null,
    load: { kind: "idle" },
    visibleSlot: 0,
  }
}

export function historyRows(window: HistoryWindow) {
  return window.slots.flatMap((slot) =>
    slot.kind === "loaded" ? slot.rows : []
  )
}

export function historyRowCount(window: HistoryWindow) {
  return historyRows(window).length
}

export function nextHistoryIntent(
  window: HistoryWindow
): { slot: number; cursor: string | null } | null {
  if (window.load.kind === "loading") return null
  const last = window.slots.at(-1)
  if (!last?.nextCursor) return null
  return { slot: window.slots.length, cursor: last.nextCursor }
}

export function reloadHistoryIntent(
  window: HistoryWindow,
  slot: number
): { slot: number; cursor: string | null } | null {
  if (window.load.kind === "loading" || window.slots[slot]?.kind !== "evicted")
    return null
  return { slot, cursor: window.slots[slot].inputCursor }
}

export function renderedHistorySlots(window: HistoryWindow) {
  let remaining = HISTORY_MAX_RENDERED_ROWS
  const result: Array<{ slot: HistorySlot; index: number }> = []
  const indexes = window.slots
    .map((_, index) => index)
    .sort(
      (left, right) =>
        Math.abs(left - window.visibleSlot) -
        Math.abs(right - window.visibleSlot)
    )
  const included = new Set<number>()
  for (const index of indexes) {
    const slot = window.slots[index]
    if (slot.kind === "evicted") {
      included.add(index)
      continue
    }
    if (slot.rows.length > remaining) continue
    included.add(index)
    remaining -= slot.rows.length
  }
  for (let index = 0; index < window.slots.length; index += 1) {
    const slot = window.slots[index]
    result.push({
      index,
      slot:
        included.has(index) || slot.kind === "evicted"
          ? slot
          : {
              kind: "evicted",
              key: slot.key,
              inputCursor: slot.inputCursor,
              nextCursor: slot.nextCursor,
              estimatedHeight: slot.estimatedHeight,
              rowCount: slot.rows.length,
            },
    })
  }
  return result
}

export function scrollAnchorDelta(beforeTop: number, afterTop: number) {
  return afterTop - beforeTop
}

export function historyWindowReducer(
  state: HistoryWindow,
  action: HistoryWindowAction
): HistoryWindow {
  switch (action.type) {
    case "sourceChanged":
      if (action.generation === state.generation) return state
      return createHistoryWindow({
        generation: action.generation,
        page: action.page,
      })
    case "pageRequested": {
      const append = nextHistoryIntent(state)
      const reload = reloadHistoryIntent(state, action.slot)
      const intent = reload ?? append
      if (
        !intent ||
        intent.slot !== action.slot ||
        intent.cursor !== action.cursor
      )
        return state
      return { ...state, load: { kind: "loading", ...intent } }
    }
    case "pageFailed":
      if (
        state.load.kind !== "loading" ||
        state.load.slot !== action.slot ||
        state.load.cursor !== action.cursor
      )
        return state
      return {
        ...state,
        load: { kind: "error", ...action },
      }
    case "pageLoaded": {
      if (
        state.load.kind !== "loading" ||
        state.load.slot !== action.slot ||
        state.load.cursor !== action.cursor
      )
        return state
      const existing = state.slots[action.slot]
      const height = existing?.estimatedHeight ?? HISTORY_PAGE_ESTIMATED_HEIGHT
      const slots = [...state.slots]
      slots[action.slot] = loadedSlot(action.cursor, action.page, height)
      const capped = capPayloads(dedupeSlots(slots), state.visibleSlot)
      return {
        ...state,
        slots: capped,
        currentChat: reconcileCurrent(state.currentChat, capped),
        load: { kind: "idle" },
      }
    }
    case "slotMeasured": {
      const slot = state.slots[action.slot]
      if (!slot || action.height <= 0 || slot.estimatedHeight === action.height)
        return state
      const slots = [...state.slots]
      slots[action.slot] = { ...slot, estimatedHeight: action.height }
      return { ...state, slots }
    }
    case "visibleSlotChanged":
      return {
        ...state,
        visibleSlot: Math.max(
          0,
          Math.min(action.slot, Math.max(0, state.slots.length - 1))
        ),
      }
    case "chatCreated": {
      const slots = state.slots.map((slot, index) => {
        if (slot.kind !== "loaded") return slot
        if (index === 0)
          return {
            ...slot,
            rows: [
              action.row,
              ...slot.rows.filter((row) => row.id !== action.row.id),
            ],
          }
        return {
          ...slot,
          rows: slot.rows.filter((row) => row.id !== action.row.id),
        }
      })
      const capped = capPayloads(slots, state.visibleSlot)
      return {
        ...state,
        slots: capped,
        currentChat: reconcileCurrent(state.currentChat, capped),
      }
    }
    case "chatTitled":
      return {
        ...state,
        slots: state.slots.map((slot) =>
          slot.kind === "loaded"
            ? {
                ...slot,
                rows: slot.rows.map((row) =>
                  row.id === action.id ? { ...row, title: action.title } : row
                ),
              }
            : slot
        ),
        currentChat:
          state.currentChat?.id === action.id
            ? { ...state.currentChat, title: action.title }
            : state.currentChat,
      }
    case "chatDeleted":
      return {
        ...state,
        slots: state.slots.map((slot) =>
          slot.kind === "loaded"
            ? { ...slot, rows: slot.rows.filter((row) => row.id !== action.id) }
            : slot
        ),
        currentChat:
          state.currentChat?.id === action.id ? null : state.currentChat,
      }
    case "currentChatLoaded":
      return {
        ...state,
        currentChat: action.row
          ? reconcileCurrent(action.row, state.slots)
          : null,
      }
  }
}
