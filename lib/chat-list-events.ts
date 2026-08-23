export type ChatListRow = {
  id: string
  title: string
  updatedAt: string | Date
}

export type ChatListState = {
  /** Identity of the last server payload incorporated into `rows`. */
  source: ChatListRow[]
  rows: ChatListRow[]
}

export const CHAT_CREATED_EVENT = "miniscira:chat-created"
export const CHAT_TITLED_EVENT = "miniscira:chat-titled"

export function chatCreatedEvent(row: ChatListRow) {
  return new CustomEvent<ChatListRow>(CHAT_CREATED_EVENT, { detail: row })
}

export function chatTitledEvent(id: string, title: string) {
  return new CustomEvent<{ id: string; title: string }>(CHAT_TITLED_EVENT, {
    detail: { id, title },
  })
}

export function addChatListRow(state: ChatListState, row: ChatListRow) {
  if (state.rows.some((chat) => chat.id === row.id)) return state
  return { ...state, rows: [row, ...state.rows] }
}

export function removeChatListRow(state: ChatListState, id: string) {
  return { ...state, rows: state.rows.filter((chat) => chat.id !== id) }
}

export function titleChatListRow(
  state: ChatListState,
  detail: { id: string; title: string }
) {
  return {
    ...state,
    rows: state.rows.map((chat) =>
      chat.id === detail.id ? { ...chat, title: detail.title } : chat
    ),
  }
}
