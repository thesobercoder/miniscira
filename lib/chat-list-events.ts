export type ChatListRow = {
  id: string
  title: string
  updatedAt: string | Date
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
